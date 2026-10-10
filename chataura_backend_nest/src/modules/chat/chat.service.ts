import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { existsSync, mkdirSync, promises as fsp } from 'fs';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import {
  catalogClientFields,
  selectedFrameClientFields,
} from '../../common/utils/catalog-media';
import { PrismaService } from '../../common/prisma/prisma.service';
import { FcmService } from '../../common/fcm/fcm.service';
import {
  ConversationRealtimeMessage,
  RealtimeService,
} from '../../common/fcm/realtime.service';
import { RedisService } from '../../common/redis/redis.service';
import { WalletService } from '../wallet/wallet.service';
import {
  CHAT_IMAGE_MAX_BYTES,
  CLIENT_MESSAGE_STATUSES,
  CLIENT_MESSAGE_TYPES,
  GROUP_MAX_MEMBERS,
  MESSAGE_TEXT_MAX,
  canManageGroup,
  canRemoveMember,
  cleanGroupName,
  cleanText,
  detectImage,
  isAllowedMediaUrl,
  normalizeGroupRole,
} from './chat-rules';
import { LedgerService } from '../wallet/ledger.service';
import { ChatEvents } from './chat.events';
import { presenceFields } from '../../common/presence/online-status';

@Injectable()
export class ChatService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly events: ChatEvents,
    private readonly config: ConfigService,
    private readonly fcm: FcmService,
    private readonly realtime: RealtimeService,
    private readonly redis: RedisService,
    private readonly wallet: WalletService,
  ) {}

  // ---------- shared guards ----------

  private static readonly DIRECT_TYPES = ['private', 'direct', 'user'];

  private isDirectType(type: string) {
    return ChatService.DIRECT_TYPES.includes(type);
  }

  /** Ids this user blocked or was blocked by. */
  private async blockedPeers(userId: bigint): Promise<Set<string>> {
    const rows = await this.prisma.blockedUser.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    return new Set(
      rows.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId).toString()),
    );
  }

  private async assertNotBlocked(userId: bigint, otherId: bigint) {
    const block = await this.prisma.blockedUser.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: otherId },
          { blockerId: otherId, blockedId: userId },
        ],
      },
      select: { blockerId: true },
    });
    if (block) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'BLOCKED',
          message:
            block.blockerId === userId
              ? 'You blocked this user. Unblock them to chat.'
              : 'You cannot message this user.',
        },
      });
    }
  }

  /** Target exists and is an active account (not deleted / suspended). */
  private async assertReachableUser(userId: bigint) {
    const u = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, accountStatus: 'active', isSuspended: false },
    });
    if (!u) {
      throw new NotFoundException({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });
    }
    return u;
  }

  /** Hosts our chat media lives on; message / group image URLs must point here. */
  private mediaPrefixes(): string[] {
    const base = this.config
      .get<string>('PUBLIC_BASE_URL', 'http://localhost:3000')
      .replace(/\/+$/, '');
    const bucket = (this.config.get<string>('GCS_BUCKET') ?? '').trim();
    return [
      `${base}/uploads`,
      ...(bucket ? [`https://storage.googleapis.com/${bucket}`] : []),
    ];
  }

  private assertMediaUrl(url: string | null | undefined, field: string) {
    if (url == null || url === '') return;
    if (!isAllowedMediaUrl(url, this.mediaPrefixes())) {
      throw new BadRequestException({
        success: false,
        error: { code: 'INVALID_MEDIA', message: `${field} must be an uploaded file` },
      });
    }
  }

  private badRequest(code: string, message: string): never {
    throw new BadRequestException({ success: false, error: { code, message } });
  }

  private forbidden(code: string, message: string): never {
    throw new ForbiddenException({ success: false, error: { code, message } });
  }

  /** Realtime (Firestore) copy of a stored message, written by the server. */
  private async publishRealtime(
    m: Parameters<ChatService['serializeMessage']>[0],
    sender: { displayName: string | null; name: string | null; avatarUrl: string | null },
    gift?: { name: string; imageUrl: string | null; animationUrl: string | null } | null,
  ): Promise<boolean> {
    const media = gift ? catalogClientFields(gift.imageUrl, gift.animationUrl) : null;
    const doc: ConversationRealtimeMessage = {
      messageId: Number(m.id),
      senderId: Number(m.senderId),
      senderName: sender.displayName ?? sender.name ?? '',
      senderAvatar: sender.avatarUrl ?? '',
      message: m.messageText ?? '',
      messageType: m.messageType,
      messageMedia: m.messageMedia ?? '',
      giftId: m.giftId ? String(m.giftId) : '',
      giftName: gift?.name ?? '',
      giftImageUrl: (media?.image_url as string | undefined) ?? gift?.imageUrl ?? '',
      giftAnimationUrl: (media?.animation_url as string | undefined) ?? gift?.animationUrl ?? '',
      createdAt: m.createdAt.toISOString(),
      clientUuid: m.clientUuid ?? '',
      status: m.status,
    };
    return this.realtime.publishConversationMessage(m.conversationId, doc);
  }

  /** Push to every other member, skipping anyone who blocked the sender. */
  private async notifyMembers(
    conversationId: bigint,
    senderId: bigint,
    senderName: string,
    payload: Record<string, unknown>,
    preview: string,
    type: string,
  ) {
    const others = await this.prisma.conversationParticipant.findMany({
      where: { conversationId, userId: { not: senderId } },
      select: { userId: true },
    });
    const blockers = await this.prisma.blockedUser.findMany({
      where: { blockedId: senderId, blockerId: { in: others.map((o) => o.userId) } },
      select: { blockerId: true },
    });
    const skip = new Set(blockers.map((b) => b.blockerId.toString()));
    for (const o of others) {
      if (skip.has(o.userId.toString())) continue;
      this.events.emitReceive(o.userId.toString(), payload);
      void this.fcm
        .sendDirectChatMessageNotification({
          recipientUserId: o.userId,
          conversationId: Number(conversationId),
          senderId: Number(senderId),
          senderName,
          messageText: preview,
          messageType: type,
        })
        .catch(() => {});
    }
  }

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.endStaleSessions().catch((e) =>
        this.logger.warn(`star-chat stale: ${String(e)}`),
      );
    }, 30_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async listConversations(userId: bigint, page = 1, limit = 20) {
    const take = Math.min(Math.max(limit, 1), 50);
    const parts = await this.prisma.conversationParticipant.findMany({
      where: { userId },
      include: {
        conversation: {
          include: {
            participants: {
              include: { user: { include: { selectedFrame: true } } },
            },
            messages: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
      skip: (Math.max(page, 1) - 1) * take,
      take,
      orderBy: { conversation: { updatedAt: 'desc' } },
    });

    // "Delete chat" is per member: a cleared conversation stays out of this member's list until
    // a message newer than the clear arrives.
    const visibleParts = parts.filter((p) => {
      if (!p.clearedAt) return true;
      const last = p.conversation.messages[0];
      return !!last && last.createdAt > p.clearedAt;
    });
    if (visibleParts.length === 0) {
      return [];
    }

    const convIds = visibleParts.map((p) => p.conversationId);
    const unreadRows = await this.prisma.$queryRaw<
      Array<{ conversation_id: bigint; unread_count: number | bigint }>
    >`
      SELECT 
        cp.conversation_id,
        COUNT(m.id)::int AS unread_count
      FROM conversation_participants cp
      JOIN messages m 
        ON m.conversation_id = cp.conversation_id 
        AND m.sender_id != cp.user_id 
        AND m.created_at > GREATEST(
          COALESCE(cp.last_read_at, '1970-01-01'::timestamptz),
          COALESCE(cp.cleared_at, '1970-01-01'::timestamptz)
        )
      WHERE cp.user_id = ${userId}
        AND cp.conversation_id IN (${Prisma.join(convIds)})
      GROUP BY cp.conversation_id
    `;

    const unreadMap = new Map<string, number>();
    for (const row of unreadRows) {
      unreadMap.set(row.conversation_id.toString(), Number(row.unread_count));
    }

    const rows = visibleParts.map((p) => {
      const c = p.conversation;
      const other = c.participants.find((x) => x.userId !== userId)?.user;
      const last = c.messages[0];
      const unread = unreadMap.get(c.id.toString()) ?? 0;
      return {
        id: Number(c.id),
        name: c.name ?? other?.displayName ?? other?.name,
        type: c.type,
        image_url: c.imageUrl ?? other?.avatarUrl,
        last_message: last?.messageText ?? null,
        last_message_type: last?.messageType ?? null,
        last_message_at: last?.createdAt.toISOString() ?? null,
        unread_count: unread,
        group_id: c.type === 'group' ? Number(c.id) : null,
        other_user: other
          ? {
              id: Number(other.id),
              name: other.displayName ?? other.name,
              avatar_url: other.avatarUrl,
              ...presenceFields(other),
              selected_frame_id: other.selectedFrameId
                ? Number(other.selectedFrameId)
                : null,
              ...selectedFrameClientFields(other.selectedFrame),
            }
          : null,
        members: c.participants.map((m) => ({
          id: Number(m.user.id),
          name: m.user.displayName ?? m.user.name,
          avatar_url: m.user.avatarUrl,
          selected_frame_id: m.user.selectedFrameId
            ? Number(m.user.selectedFrameId)
            : null,
          ...selectedFrameClientFields(m.user.selectedFrame),
        })),
      };
    });
    return this.dedupeDirectConversations(rows);
  }

  /** Collapse legacy duplicate private threads for the same peer. */
  private dedupeDirectConversations<
    T extends {
      id: number;
      type: string;
      name?: string | null;
      image_url?: string | null;
      last_message_at?: string | null;
      unread_count: number;
      other_user?: {
        id: number;
        avatar_url?: string | null;
        last_seen_at?: string | null;
      } | null;
    },
  >(rows: T[]): T[] {
    const out: T[] = [];
    for (const row of rows) {
      const peerId = row.other_user?.id ?? 0;
      const isDirect =
        row.type === 'private' ||
        row.type === 'user' ||
        row.type === 'direct' ||
        (peerId !== 0 && row.type !== 'group' && row.type !== 'family');
      if (!isDirect || peerId === 0) {
        out.push(row);
        continue;
      }
      const idx = out.findIndex(
        (x) =>
          (x.type === 'private' ||
            x.type === 'user' ||
            x.type === 'direct' ||
            ((x.other_user?.id ?? 0) !== 0 &&
              x.type !== 'group' &&
              x.type !== 'family')) &&
          x.other_user?.id === peerId,
      );
      if (idx < 0) {
        out.push(row);
        continue;
      }
      const prev = out[idx];
      const prevAt = prev.last_message_at ?? '';
      const nextAt = row.last_message_at ?? '';
      const preferNext =
        (!!prevAt && !!nextAt && nextAt >= prevAt) ||
        (!prevAt && !!nextAt) ||
        (!prevAt && !nextAt && row.id > prev.id);
      const keep = preferNext ? row : prev;
      const drop = preferNext ? prev : row;
      out[idx] = {
        ...keep,
        unread_count: (prev.unread_count ?? 0) + (row.unread_count ?? 0),
        image_url: keep.image_url || drop.image_url,
        name: keep.name || drop.name,
        other_user: keep.other_user
          ? {
              ...keep.other_user,
              avatar_url:
                keep.other_user.avatar_url || drop.other_user?.avatar_url,
              last_seen_at:
                keep.other_user.last_seen_at ||
                drop.other_user?.last_seen_at ||
                null,
            }
          : drop.other_user,
      };
    }
    return out;
  }

  async withUser(userId: bigint, otherId: bigint) {
    if (userId === otherId) {
      this.badRequest('INVALID', 'Cannot chat with yourself');
    }
    const other = await this.assertReachableUser(otherId);
    await this.assertNotBlocked(userId, otherId);
    const [minId, maxId] =
      userId < otherId ? [userId, otherId] : [otherId, userId];
    const lockKey = `chat_convo_${minId}_${maxId}`;
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
      const mine = await tx.conversationParticipant.findMany({
        where: { userId },
        include: { conversation: { include: { participants: true } } },
      });
      const existing = mine.find(
        (p) =>
          this.isDirectType(p.conversation.type) &&
          p.conversation.participants.some((x) => x.userId === otherId) &&
          p.conversation.participants.length === 2,
      );
      if (existing) {
        return {
          conversation_id: Number(existing.conversationId),
          name: other.displayName ?? other.name,
          image_url: other.avatarUrl,
        };
      }
      const convo = await tx.conversation.create({
        data: {
          type: 'private',
          name: other.displayName ?? other.name,
          participants: {
            create: [{ userId }, { userId: otherId }],
          },
        },
      });
      return {
        conversation_id: Number(convo.id),
        name: other.displayName ?? other.name,
        image_url: other.avatarUrl,
      };
    });
  }

  async markRead(userId: bigint, conversationId: bigint) {
    const part = await this.requireParticipant(userId, conversationId);
    const now = new Date();
    await this.prisma.conversationParticipant.update({
      where: {
        conversationId_userId: { conversationId, userId },
      },
      data: { lastReadAt: now },
    });
    // Per-message "read" is a 1-1 notion. In groups one member reading must not show the
    // sender "Seen" for everyone — group read state lives in each member's last_read_at.
    if (this.isDirectType(part.conversation.type)) {
      await this.prisma.message.updateMany({
        where: {
          conversationId,
          senderId: { not: userId },
          status: { not: 'read' },
        },
        data: { status: 'read' },
      });
    }
    const participants = await this.prisma.conversationParticipant.findMany({
      where: { conversationId, userId: { not: userId } },
      select: { userId: true },
    });
    const readPayload = {
      conversation_id: Number(conversationId),
      read_by_user_id: Number(userId),
      read_at: now.toISOString(),
    };
    for (const p of participants) {
      this.events.emitRead(p.userId.toString(), readPayload);
    }
    void this.realtime.publishReadReceipt(conversationId, userId);
    return { ok: true };
  }

  /**
   * "Delete chat" for 1-1 conversations hides it for THIS member only (history up to now is
   * cleared for them); the other person keeps their copy. Groups are left via leaveGroup.
   */
  async deleteConversation(userId: bigint, conversationId: bigint) {
    const part = await this.requireParticipant(userId, conversationId);
    if (!this.isDirectType(part.conversation.type)) {
      this.forbidden('FORBIDDEN', 'Leave the group instead of deleting it');
    }
    await this.prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { clearedAt: new Date(), lastReadAt: new Date() },
    });
    return { message: 'Conversation deleted' };
  }

  /**
   * History, newest page first. [beforeId] pages backwards from a message id (stable while new
   * messages arrive); without it the legacy page number is used. Messages a member cleared are
   * never returned to them.
   */
  async messages(
    userId: bigint,
    conversationId: bigint,
    page = 1,
    limit = 50,
    beforeId?: bigint | null,
  ) {
    const part = await this.requireParticipant(userId, conversationId);
    const take = Math.min(Math.max(limit, 1), 100);
    const where: Prisma.MessageWhereInput = {
      conversationId,
      ...(part.clearedAt ? { createdAt: { gt: part.clearedAt } } : {}),
      ...(beforeId ? { id: { lt: beforeId } } : {}),
    };
    const rows = await this.prisma.message.findMany({
      where,
      include: { sender: true },
      orderBy: { id: 'desc' },
      skip: beforeId ? 0 : (Math.max(page, 1) - 1) * take,
      take,
    });
    return rows.reverse().map((m) => this.serializeMessage(m));
  }

  async send(
    userId: bigint,
    body: {
      conversation_id: number | string;
      message_type?: string;
      type?: string;
      message?: string;
      message_text?: string;
      message_media?: string;
      image_url?: string;
      gift_id?: number | string;
      client_uuid?: string;
    },
  ) {
    const conversationId = BigInt(body.conversation_id);
    const part = await this.requireParticipant(userId, conversationId);
    const type = (body.message_type ?? body.type ?? 'text').toLowerCase();
    if (type === 'gift') {
      // Older app versions pay via wallet/send-gift, then post the bubble here. Accept that only
      // when it matches a real, unused payment (each payment yields at most one bubble).
      return this.sendLegacyGiftBubble(userId, conversationId, part.conversation.type, body.gift_id);
    }
    if (!CLIENT_MESSAGE_TYPES.has(type)) {
      this.badRequest('INVALID_TYPE', `Unsupported message type: ${type}`);
    }
    const text = cleanText(body.message_text ?? body.message);
    const media = cleanText(body.image_url ?? body.message_media);
    if (text && text.length > MESSAGE_TEXT_MAX) {
      this.badRequest('TOO_LONG', `Messages are limited to ${MESSAGE_TEXT_MAX} characters`);
    }
    if (type === 'text' && !text) this.badRequest('EMPTY', 'Message is empty');
    if (type === 'image') {
      if (!media) this.badRequest('MEDIA_REQUIRED', 'Image message needs an uploaded image');
      this.assertMediaUrl(media, 'image_url');
    }
    const clientUuid = cleanText(body.client_uuid)?.slice(0, 64) ?? null;

    if (this.isDirectType(part.conversation.type)) {
      const peer = await this.prisma.conversationParticipant.findFirst({
        where: { conversationId, userId: { not: userId } },
        select: { userId: true },
      });
      if (peer) await this.assertNotBlocked(userId, peer.userId);
    }
    await this.assertStarChatAllowed(userId, conversationId);

    // Idempotent retry: the same client_uuid returns the stored message instead of a duplicate.
    if (clientUuid) {
      const prior = await this.prisma.message.findUnique({
        where: { senderId_clientUuid: { senderId: userId, clientUuid } },
        include: { sender: true },
      });
      if (prior) return { ...this.serializeMessage(prior), realtime_published: true };
    }

    const sender = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    let msg;
    try {
      msg = await this.prisma.message.create({
        data: {
          conversationId,
          senderId: userId,
          messageType: type,
          messageText: text,
          messageMedia: type === 'image' ? media : null,
          status: 'sent',
          clientUuid,
        },
        include: { sender: true },
      });
    } catch (e) {
      if (
        clientUuid &&
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        const prior = await this.prisma.message.findUniqueOrThrow({
          where: { senderId_clientUuid: { senderId: userId, clientUuid } },
          include: { sender: true },
        });
        return { ...this.serializeMessage(prior), realtime_published: true };
      }
      throw e;
    }
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
    const payload = this.serializeMessage(msg, sender);
    const realtimePublished = await this.publishRealtime(msg, sender);
    await this.notifyMembers(
      conversationId,
      userId,
      sender.displayName ?? sender.name ?? 'User',
      payload,
      type === 'image' ? '📷 Photo' : (text ?? ''),
      type,
    );
    return { ...payload, realtime_published: realtimePublished };
  }

  private async sendLegacyGiftBubble(
    userId: bigint,
    conversationId: bigint,
    conversationType: string,
    rawGiftId: number | string | undefined,
  ) {
    let giftId: bigint;
    try {
      giftId = BigInt(rawGiftId ?? '');
    } catch {
      this.badRequest('GIFT_REQUIRED', 'gift_id is required');
    }
    if (!this.isDirectType(conversationType)) {
      this.badRequest('NOT_DIRECT', 'Gifts can only be sent in 1-1 chats');
    }
    const peer = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId, userId: { not: userId } },
      select: { userId: true },
    });
    if (!peer) this.badRequest('NO_RECEIVER', 'This chat has no other member');
    const payments = await this.prisma.coinTransaction.findMany({
      where: {
        userId,
        type: 'GIFT',
        referenceId: { startsWith: `gift_${giftId}_to_${peer.userId}_${userId}_` },
        createdAt: { gt: new Date(Date.now() - 10 * 60_000) },
      },
      orderBy: { id: 'asc' },
      select: { referenceId: true },
    });
    const refs = payments.map((p) => p.referenceId!).filter(Boolean);
    const used = refs.length
      ? await this.prisma.message.findMany({
          where: { senderId: userId, clientUuid: { in: refs } },
          select: { clientUuid: true },
        })
      : [];
    const usedSet = new Set(used.map((u) => u.clientUuid));
    const bubbled = refs.length
      ? await this.redis
          .getClient()
          .mget(...refs.map((r) => `dm_gift_bubbled:${r}`))
          .catch(() => refs.map(() => null))
      : [];
    const ref = refs.find((r, i) => !usedSet.has(r) && !bubbled[i]);
    if (!ref) {
      this.forbidden('GIFT_NOT_PAID', 'Gifts must be paid before they appear in chat');
    }
    const gift = await this.prisma.gift.findUnique({ where: { id: giftId } });
    const sender = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const msg = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: userId,
        messageType: 'gift',
        messageText: gift?.name ?? 'Gift',
        giftId,
        status: 'sent',
        clientUuid: ref,
      },
      include: { sender: true },
    });
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
    const payload = this.serializeMessage(msg, sender);
    const realtimePublished = await this.publishRealtime(msg, sender, gift);
    await this.notifyMembers(
      conversationId,
      userId,
      sender.displayName ?? sender.name ?? 'User',
      payload,
      `🎁 ${gift?.name ?? 'Gift'}`,
      'gift',
    );
    return { ...payload, realtime_published: realtimePublished };
  }

  /**
   * Gift in a 1-1 chat: payment and the gift message happen in one server call, so a gift
   * bubble can't exist without a payment and a payment can't end up without its bubble.
   * [client_uuid] makes retries safe (no double charge).
   */
  async sendGift(
    userId: bigint,
    conversationId: bigint,
    body: {
      gift_id?: number | string;
      gift_key?: string;
      gift_name?: string;
      gift_category?: string;
      quantity?: number;
      expected_coin_cost?: number | string;
      client_uuid?: string;
    },
  ) {
    const part = await this.requireParticipant(userId, conversationId);
    if (!this.isDirectType(part.conversation.type)) {
      this.badRequest('NOT_DIRECT', 'Gifts can only be sent in 1-1 chats');
    }
    const peer = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId, userId: { not: userId } },
      select: { userId: true },
    });
    if (!peer) this.badRequest('NO_RECEIVER', 'This chat has no other member');
    await this.assertNotBlocked(userId, peer.userId);

    const clientUuid = cleanText(body.client_uuid)?.slice(0, 64) ?? `gift_${randomUUID()}`;
    const prior = await this.prisma.message.findUnique({
      where: { senderId_clientUuid: { senderId: userId, clientUuid } },
      include: { sender: true },
    });
    if (prior) {
      return { already_sent: true, message: this.serializeMessage(prior), realtime_published: true };
    }
    const lockKey = `dm_gift:${userId}:${clientUuid}`;
    const locked = await this.redis
      .getClient()
      .set(lockKey, '1', 'EX', 60, 'NX')
      .catch(() => 'OK');
    if (!locked) this.badRequest('DUPLICATE_REQUEST', 'This gift is already being sent');

    const paid = await this.wallet.sendGift(userId, {
      gift_id: body.gift_id ?? '',
      gift_key: body.gift_key,
      gift_name: body.gift_name,
      gift_category: body.gift_category,
      quantity: body.quantity,
      expected_coin_cost: body.expected_coin_cost,
      receiver_id: peer.userId.toString(),
      idempotency_key: clientUuid,
    });
    // This payment already has its bubble (below); the legacy bubble path must not reuse it.
    await this.redis
      .getClient()
      .set(`dm_gift_bubbled:${paid.transaction_id}`, '1', 'EX', 15 * 60)
      .catch(() => null);

    const gift = await this.prisma.gift.findUnique({ where: { id: BigInt(paid.gift_id) } });
    const sender = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const qtySuffix = paid.quantity > 1 ? ` x${paid.quantity}` : '';
    let message: ReturnType<ChatService['serializeMessage']> | null = null;
    let realtimePublished = false;
    try {
      const msg = await this.prisma.message.create({
        data: {
          conversationId,
          senderId: userId,
          messageType: 'gift',
          messageText: `${gift?.name ?? 'Gift'}${qtySuffix}`,
          giftId: BigInt(paid.gift_id),
          status: 'sent',
          clientUuid,
        },
        include: { sender: true },
      });
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
      message = this.serializeMessage(msg, sender);
      realtimePublished = await this.publishRealtime(msg, sender, gift);
      await this.notifyMembers(
        conversationId,
        userId,
        sender.displayName ?? sender.name ?? 'User',
        message,
        `🎁 ${gift?.name ?? 'Gift'}${qtySuffix}`,
        'gift',
      );
    } catch (e) {
      // Payment already committed — never fail the call; the wallet ledger is the record.
      this.logger.error(`gift message for ${paid.transaction_id} failed: ${String(e)}`);
    }
    return { ...paid, message, realtime_published: realtimePublished };
  }

  async listFriends(userId: bigint) {
    const blocks = await this.prisma.blockedUser.findMany({
      where: {
        OR: [{ blockerId: userId }, { blockedId: userId }],
      },
    });
    const blockedIds = new Set<bigint>();
    for (const b of blocks) {
      blockedIds.add(b.blockerId === userId ? b.blockedId : b.blockerId);
    }

    const friendships = await this.prisma.friendship.findMany({
      where: {
        userId,
        friendId: { notIn: Array.from(blockedIds) },
      },
      include: {
        friend: { include: { selectedFrame: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const directParts = await this.prisma.conversationParticipant.findMany({
      where: {
        userId,
        conversation: { type: { in: ChatService.DIRECT_TYPES } },
      },
      include: {
        conversation: {
          include: {
            participants: true,
          },
        },
      },
    });

    const convMap = new Map<string, number>();
    for (const dp of directParts) {
      const other = dp.conversation.participants.find((p) => p.userId !== userId);
      if (other) {
        convMap.set(other.userId.toString(), Number(dp.conversationId));
      }
    }

    return friendships.map((f) => ({
      id: Number(f.friend.id),
      name: f.friend.displayName ?? f.friend.name ?? 'User',
      avatar_url: f.friend.avatarUrl,
      ...presenceFields(f.friend),
      conversation_id: convMap.get(f.friend.id.toString()) ?? null,
      selected_frame_id: f.friend.selectedFrameId
        ? Number(f.friend.selectedFrameId)
        : null,
      ...selectedFrameClientFields(f.friend.selectedFrame),
      is_owner: false,
    }));
  }

  /** Owner of a group: the member with role owner (earliest member as a legacy fallback). */
  private ownerOf(participants: Array<{ userId: bigint; role: string; id: bigint }>): bigint | null {
    const owner = participants.find((p) => normalizeGroupRole(p.role) === 'owner');
    if (owner) return owner.userId;
    const sorted = [...participants].sort((a, b) => (a.id < b.id ? -1 : 1));
    return sorted[0]?.userId ?? null;
  }

  private serializeGroup(
    convo: { id: bigint; name: string | null; imageUrl: string | null },
    participants: Array<{ userId: bigint; role: string; id: bigint }>,
  ) {
    const owner = this.ownerOf(participants);
    return {
      id: Number(convo.id),
      name: convo.name ?? 'Group',
      image_url: convo.imageUrl,
      member_count: participants.length,
      conversation_id: Number(convo.id),
      owner_id: owner != null ? Number(owner) : null,
    };
  }

  private async requireGroupMember(userId: bigint, groupId: bigint) {
    const part = await this.requireParticipant(userId, groupId);
    if (part.conversation.type !== 'group') {
      this.badRequest('NOT_A_GROUP', 'Not a group conversation');
    }
    return part;
  }

  /**
   * New member ids that may join: existing active accounts, not already members, and with no
   * block in either direction with [actorId]. Returns accepted ids and the ones skipped.
   */
  private async vetNewMembers(actorId: bigint, groupId: bigint | null, raw: Array<number | string>) {
    const requested: bigint[] = [];
    for (const m of raw ?? []) {
      try {
        const id = BigInt(m);
        if (id > 0n && id !== actorId && !requested.includes(id)) requested.push(id);
      } catch {
        /* ignore malformed id */
      }
    }
    if (requested.length === 0) return { accepted: [] as bigint[], skipped: [] as number[] };
    const [users, blocked, existing] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: requested }, deletedAt: null, accountStatus: 'active', isSuspended: false },
        select: { id: true },
      }),
      this.blockedPeers(actorId),
      groupId
        ? this.prisma.conversationParticipant.findMany({
            where: { conversationId: groupId, userId: { in: requested } },
            select: { userId: true },
          })
        : Promise.resolve([] as Array<{ userId: bigint }>),
    ]);
    const valid = new Set(users.map((u) => u.id.toString()));
    const already = new Set(existing.map((e) => e.userId.toString()));
    const accepted: bigint[] = [];
    const skipped: number[] = [];
    for (const id of requested) {
      const k = id.toString();
      if (valid.has(k) && !blocked.has(k) && !already.has(k)) accepted.push(id);
      else if (!already.has(k)) skipped.push(Number(id));
    }
    return { accepted, skipped };
  }

  async listGroups(userId: bigint) {
    const parts = await this.prisma.conversationParticipant.findMany({
      where: { userId, conversation: { type: 'group' } },
      include: {
        conversation: { include: { participants: true } },
      },
      orderBy: { conversation: { updatedAt: 'desc' } },
    });
    return parts.map((p) => this.serializeGroup(p.conversation, p.conversation.participants));
  }

  async getGroup(userId: bigint, groupId: bigint) {
    await this.requireGroupMember(userId, groupId);
    const convo = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: groupId },
      include: { participants: true },
    });
    return this.serializeGroup(convo, convo.participants);
  }

  async createGroup(
    userId: bigint,
    body: { name: string; image?: string; members?: Array<number | string> },
  ) {
    const name = cleanGroupName(body?.name);
    if (!name) this.badRequest('NAME_REQUIRED', 'Group name is required');
    const image = cleanText(body?.image);
    this.assertMediaUrl(image, 'image');
    const { accepted, skipped } = await this.vetNewMembers(userId, null, body?.members ?? []);
    if (accepted.length + 1 > GROUP_MAX_MEMBERS) {
      this.badRequest('TOO_MANY_MEMBERS', `Groups can have at most ${GROUP_MAX_MEMBERS} members`);
    }
    const convo = await this.prisma.conversation.create({
      data: {
        type: 'group',
        name,
        imageUrl: image,
        participants: {
          create: [
            { userId, role: 'owner' },
            ...accepted.map((id) => ({ userId: id, role: 'member' })),
          ],
        },
      },
      include: { participants: true },
    });
    void this.pushConversationMembers(convo.id);
    return { ...this.serializeGroup(convo, convo.participants), skipped_member_ids: skipped };
  }

  async groupMembers(userId: bigint, groupId: bigint) {
    await this.requireGroupMember(userId, groupId);
    const parts = await this.prisma.conversationParticipant.findMany({
      where: { conversationId: groupId },
      include: { user: true },
      orderBy: { id: 'asc' },
    });
    const ownerId = this.ownerOf(parts);
    return parts.map((p) => {
      const role = p.userId === ownerId ? 'owner' : normalizeGroupRole(p.role);
      return {
        id: Number(p.userId),
        user_id: Number(p.userId),
        name: p.user.displayName ?? p.user.name,
        avatar: p.user.avatarUrl,
        avatar_url: p.user.avatarUrl,
        role,
        is_admin: role === 'owner' || role === 'admin',
        is_owner: role === 'owner',
      };
    });
  }

  /**
   * Leaving: an owner hands the group to the longest-serving admin (else member) explicitly;
   * the last member leaving deletes the group instead of leaving an empty one behind.
   */
  async leaveGroup(userId: bigint, groupId: bigint) {
    const part = await this.requireGroupMember(userId, groupId);
    const wasOwner = normalizeGroupRole(part.role) === 'owner' ||
      this.ownerOf(
        await this.prisma.conversationParticipant.findMany({ where: { conversationId: groupId } }),
      ) === userId;
    const remaining = await this.prisma.$transaction(async (tx) => {
      await tx.conversationParticipant.delete({
        where: { conversationId_userId: { conversationId: groupId, userId } },
      });
      const rest = await tx.conversationParticipant.findMany({
        where: { conversationId: groupId },
        orderBy: { id: 'asc' },
      });
      if (rest.length === 0) {
        await tx.conversation.delete({ where: { id: groupId } });
        return 0;
      }
      if (wasOwner) {
        const heir = rest.find((r) => normalizeGroupRole(r.role) === 'admin') ?? rest[0];
        await tx.conversationParticipant.update({
          where: { id: heir.id },
          data: { role: 'owner' },
        });
      }
      return rest.length;
    });
    if (remaining === 0) void this.realtime.deleteConversation(groupId);
    else void this.pushConversationMembers(groupId);
    return { message: 'Left group' };
  }

  async deleteGroup(userId: bigint, groupId: bigint) {
    await this.requireGroupMember(userId, groupId);
    const parts = await this.prisma.conversationParticipant.findMany({
      where: { conversationId: groupId },
    });
    if (this.ownerOf(parts) !== userId) {
      this.forbidden('FORBIDDEN', 'Only the group owner can delete the group');
    }
    await this.prisma.conversation.delete({ where: { id: groupId } });
    void this.realtime.deleteConversation(groupId);
    return { message: 'Group deleted' };
  }

  async addGroupMembers(
    userId: bigint,
    groupId: bigint,
    members: Array<number | string>,
  ) {
    const part = await this.requireGroupMember(userId, groupId);
    const parts = await this.prisma.conversationParticipant.findMany({
      where: { conversationId: groupId },
    });
    const actorRole = this.ownerOf(parts) === userId ? 'owner' : part.role;
    if (!canManageGroup(actorRole)) {
      this.forbidden('FORBIDDEN', 'Only the group owner or admins can add members');
    }
    const { accepted, skipped } = await this.vetNewMembers(userId, groupId, members);
    if (parts.length + accepted.length > GROUP_MAX_MEMBERS) {
      this.badRequest('TOO_MANY_MEMBERS', `Groups can have at most ${GROUP_MAX_MEMBERS} members`);
    }
    if (accepted.length) {
      await this.prisma.conversationParticipant.createMany({
        data: accepted.map((id) => ({ conversationId: groupId, userId: id, role: 'member' })),
        skipDuplicates: true,
      });
      void this.pushConversationMembers(groupId);
    }
    const list = await this.groupMembers(userId, groupId);
    return Object.assign(list, { skipped_member_ids: skipped });
  }

  async removeGroupMember(userId: bigint, groupId: bigint, targetId: bigint) {
    await this.requireGroupMember(userId, groupId);
    const parts = await this.prisma.conversationParticipant.findMany({
      where: { conversationId: groupId },
    });
    const ownerId = this.ownerOf(parts);
    const roleOf = (id: bigint) =>
      id === ownerId ? 'owner' : normalizeGroupRole(parts.find((p) => p.userId === id)?.role);
    const target = parts.find((p) => p.userId === targetId);
    if (!target) {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_MEMBER', message: 'That user is not in this group' },
      });
    }
    if (targetId === userId || !canRemoveMember(roleOf(userId), roleOf(targetId))) {
      this.forbidden('FORBIDDEN', 'You cannot remove this member');
    }
    await this.prisma.conversationParticipant.delete({ where: { id: target.id } });
    void this.pushConversationMembers(groupId);
    return { message: 'Member removed' };
  }

  async updateGroup(
    userId: bigint,
    groupId: bigint,
    body: { image_url?: string; name?: string },
  ) {
    const part = await this.requireGroupMember(userId, groupId);
    const parts = await this.prisma.conversationParticipant.findMany({
      where: { conversationId: groupId },
    });
    const actorRole = this.ownerOf(parts) === userId ? 'owner' : part.role;
    if (!canManageGroup(actorRole)) {
      this.forbidden('FORBIDDEN', 'Only the group owner or admins can edit the group');
    }
    const data: Prisma.ConversationUpdateInput = {};
    if (body?.name !== undefined) {
      const name = cleanGroupName(body.name);
      if (!name) this.badRequest('NAME_REQUIRED', 'Group name is required');
      data.name = name;
    }
    if (body?.image_url !== undefined) {
      const image = cleanText(body.image_url);
      this.assertMediaUrl(image, 'image_url');
      data.imageUrl = image;
    }
    const convo = await this.prisma.conversation.update({
      where: { id: groupId },
      data,
    });
    return {
      id: Number(convo.id),
      name: convo.name,
      image_url: convo.imageUrl,
      conversation_id: Number(convo.id),
    };
  }

  /**
   * Chat image upload. The file type is detected from its bytes (the client's declared MIME and
   * file name are ignored), so only real JPEG / PNG / WebP / GIF images are stored — never SVG
   * or HTML that would run scripts from our domain — and files over 10 MB are rejected.
   */
  async uploadImage(req: any) {
    if (!req || typeof req.file !== 'function') {
      this.badRequest('FILE_REQUIRED', 'Multipart image file is required');
    }
    const part = await req.file();
    if (!part) this.badRequest('FILE_REQUIRED', 'No file uploaded');

    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of part.file as AsyncIterable<Buffer>) {
      size += chunk.length;
      if (size > CHAT_IMAGE_MAX_BYTES) {
        part.file.resume?.();
        this.badRequest('FILE_TOO_LARGE', 'Images are limited to 10 MB');
      }
      chunks.push(chunk);
    }
    const buf = Buffer.concat(chunks);
    const detected = detectImage(buf.subarray(0, 16));
    if (!detected) {
      this.badRequest('INVALID_IMAGE', 'Only JPEG, PNG, WebP or GIF images are allowed');
    }

    const dir = resolve(process.cwd(), 'uploads', 'chat');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const filename = `chat_${Date.now()}_${randomUUID()}.${detected.ext}`;
    await fsp.writeFile(resolve(dir, filename), buf);
    const publicBase = this.config
      .get<string>('PUBLIC_BASE_URL', 'http://localhost:3000')
      .replace(/\/+$/, '');

    return {
      url: `${publicBase}/uploads/chat/${filename}`,
    };
  }

  async markReadBulk(
    userId: bigint,
    body: { conversation_ids?: Array<number | string> },
  ) {
    const rawIds = body?.conversation_ids ?? [];
    const validIds = rawIds
      .map((id) => {
        try {
          return BigInt(id);
        } catch {
          return null;
        }
      })
      .filter((id): id is bigint => id !== null && id > 0n)
      .slice(0, 200);

    if (validIds.length === 0) {
      return { success: true, updated_count: 0 };
    }

    const now = new Date();
    const result = await this.prisma.conversationParticipant.updateMany({
      where: {
        userId,
        conversationId: { in: validIds },
      },
      data: {
        lastReadAt: now,
      },
    });

    return {
      success: true,
      updated_count: result.count,
      last_read_at: now.toISOString(),
    };
  }

  /**
   * Delivery / read report for one message (or a whole conversation). Only a member of the
   * message's conversation may report, only on messages they received, only `delivered` /
   * `read`, and status never moves backwards.
   */
  async updateStatus(
    userId: bigint,
    body: {
      conversation_id?: number | string;
      message_id?: number | string;
      status?: string;
    },
  ) {
    if (body.conversation_id) {
      await this.markRead(userId, BigInt(body.conversation_id));
    }
    if (body.message_id) {
      const status = (body.status ?? 'read').toLowerCase();
      if (!CLIENT_MESSAGE_STATUSES.has(status)) {
        this.badRequest('INVALID_STATUS', 'Status must be delivered or read');
      }
      const msg = await this.prisma.message.findUnique({
        where: { id: BigInt(body.message_id) },
        select: { id: true, conversationId: true, senderId: true },
      });
      if (!msg) {
        throw new NotFoundException({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Message not found' },
        });
      }
      const part = await this.requireParticipant(userId, msg.conversationId);
      if (msg.senderId !== userId && this.isDirectType(part.conversation.type)) {
        await this.prisma.message.updateMany({
          where: {
            id: msg.id,
            status: status === 'read' ? { not: 'read' } : 'sent',
          },
          data: { status },
        });
      }
    }
    return { ok: true };
  }

  async deleteMessage(userId: bigint, messageId: bigint) {
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
    });
    if (!msg || msg.senderId !== userId) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only the sender can delete' },
      });
    }
    await this.requireParticipant(userId, msg.conversationId);
    await this.prisma.message.delete({ where: { id: messageId } });
    const realtimeDeleted = await this.realtime.deleteConversationMessage(
      msg.conversationId,
      messageId,
    );
    return { message: 'Deleted', realtime_deleted: realtimeDeleted };
  }

  async starConfig() {
    const s = await this.settings();
    return {
      price_per_min: s.starChatPricePerMin,
      commission_percent: Number(s.starChatCommissionPct),
      heartbeat_interval_seconds: s.starChatHeartbeatSec,
      stale_after_seconds: 90,
    };
  }

  async starPreview(userId: bigint, conversationId: bigint) {
    await this.requireParticipant(userId, conversationId);
    const parts = await this.prisma.conversationParticipant.findMany({
      where: { conversationId },
      include: { user: true },
    });
    const stars = parts.filter((p) => p.user.isStarAccount);
    const normals = parts.filter((p) => !p.user.isStarAccount);
    const billable = stars.length === 1 && normals.length === 1;
    const star = stars[0]?.user;
    const payer = normals[0]?.user;
    const iAmPayer = payer?.id === userId;
    const iAmStar = star?.id === userId;
    const settings = await this.settings();
    const me = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const active = await this.prisma.starChatSession.findFirst({
      where: { conversationId, status: 'active' },
    });
    let blockReason: string | null = null;
    if (!billable) blockReason = 'NOT_BILLABLE';
    if (iAmPayer && Number(me.walletBalance) < settings.starChatPricePerMin) {
      blockReason = 'INSUFFICIENT_BALANCE';
    }
    return {
      billable,
      i_am_payer: iAmPayer,
      i_am_star: iAmStar,
      payer_id: payer ? Number(payer.id) : null,
      star_user_id: star ? Number(star.id) : null,
      price_per_min: settings.starChatPricePerMin,
      quoted_first_minute: settings.starChatPricePerMin,
      wallet_balance: Number(me.walletBalance),
      can_start: billable && iAmPayer && !blockReason,
      block_reason: blockReason,
      active_session: active ? this.serializeSession(active) : null,
    };
  }

  async startSession(userId: bigint, conversationId: bigint) {
    const preview = await this.starPreview(userId, conversationId);
    if (!preview.can_start || !preview.payer_id || !preview.star_user_id) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: preview.block_reason ?? 'CANNOT_START',
          message: 'Cannot start star chat',
        },
      });
    }
    const settings = await this.settings();
    const lockKey = `star_chat_start_${conversationId}`;
    const session = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
      const existing = await tx.starChatSession.findFirst({
        where: { conversationId, status: 'active' },
      });
      if (existing) return existing;
      return tx.starChatSession.create({
        data: {
          conversationId,
          payerId: userId,
          starUserId: BigInt(preview.star_user_id!),
          pricePerMin: settings.starChatPricePerMin,
          commissionPercent: settings.starChatCommissionPct,
          payerHeartbeatAt: new Date(),
        },
      });
    });
    return this.serializeSession(session);
  }

  async activeSession(userId: bigint) {
    const session = await this.prisma.starChatSession.findFirst({
      where: {
        status: 'active',
        OR: [{ payerId: userId }, { starUserId: userId }],
      },
    });
    return { session: session ? this.serializeSession(session) : null };
  }

  async heartbeat(userId: bigint, sessionId: bigint) {
    const session = await this.prisma.starChatSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.status !== 'active') {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Session not found' },
      });
    }
    if (session.payerId !== userId) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Payer only' },
      });
    }
    const payer = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (payer.walletBalance < BigInt(session.pricePerMin)) {
      await this.endSession(userId, sessionId, 'insufficient_coins');
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'INSUFFICIENT_COINS',
          message: 'Insufficient coins to continue star chat',
        },
      });
    }
    const updated = await this.prisma.starChatSession.update({
      where: { id: sessionId },
      data: { payerHeartbeatAt: new Date() },
    });
    return this.serializeSession(updated);
  }

  async endSession(userId: bigint, sessionId: bigint, reason = 'user') {
    const session = await this.prisma.starChatSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Session not found' },
      });
    }
    if (session.payerId !== userId && session.starUserId !== userId) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Not a participant' },
      });
    }
    if (session.status === 'ended') {
      return this.serializeSession(session);
    }
    const minutes = Math.max(
      1,
      Math.ceil((Date.now() - session.startedAt.getTime()) / 60_000),
    );
    const coins = BigInt(minutes * session.pricePerMin);

    await this.prisma.$transaction(async (tx) => {
      // Atomic claim: transition from non-ended to ended
      const claim = await tx.starChatSession.updateMany({
        where: { id: sessionId, status: { not: 'ended' } },
        data: { status: 'ended', endedAt: new Date(), endReason: reason },
      });
      if (claim.count === 0) {
        return;
      }

      // Lock participants deterministically
      const userMap = await this.ledger.lockUsers(tx, [
        session.payerId,
        session.starUserId,
      ]);
      const payerLocked = userMap.get(session.payerId.toString());

      let coinsToDebit = coins;
      if (payerLocked && payerLocked.wallet_balance < coins) {
        coinsToDebit =
          payerLocked.wallet_balance > 0n ? payerLocked.wallet_balance : 0n;
      }

      let actualCoinsDebited = 0n;
      if (coinsToDebit > 0n) {
        await this.ledger.debitCoins(
          tx,
          session.payerId,
          coinsToDebit,
          'STAR_CHAT',
          'Star chat session',
          `star_chat_${session.id}`,
          payerLocked,
        );
        actualCoinsDebited = coinsToDebit;
      }

      const commission = BigInt(
        Math.floor(
          Number(actualCoinsDebited) * (Number(session.commissionPercent) / 100),
        ),
      );
      const actualGemsCredited =
        actualCoinsDebited > commission ? actualCoinsDebited - commission : 0n;

      if (actualGemsCredited > 0n) {
        await tx.user.update({
          where: { id: session.starUserId },
          data: { gems: { increment: actualGemsCredited } },
        });
        const starLocked = userMap.get(session.starUserId.toString());
        await this.ledger.writeLedger(tx, {
          userId: session.starUserId,
          type: 'STAR_CHAT_EARNED',
          title: 'Star chat earnings',
          coinAmount: 0,
          netAmount: actualGemsCredited,
          commissionAmount: commission,
          referenceId: `star_chat_${session.id}_earned`,
          meta: {
            source: 'star_chat',
            currency: 'gems',
            gems_delta: Number(actualGemsCredited),
            gems_after: Number(BigInt(starLocked?.gems ?? 0n) + actualGemsCredited),
            payer_id: Number(session.payerId),
            session_id: Number(session.id),
          },
        });
      }

      await tx.starChatSession.update({
        where: { id: session.id },
        data: {
          coinsCharged: actualCoinsDebited,
          gemsCredited: actualGemsCredited,
        },
      });
    });
    const fresh = await this.prisma.starChatSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    return this.serializeSession(fresh);
  }

  private async assertStarChatAllowed(userId: bigint, conversationId: bigint) {
    const preview = await this.starPreview(userId, conversationId);
    if (!preview.billable) return;
    if (!preview.i_am_payer) return;
    const active = await this.prisma.starChatSession.findFirst({
      where: { conversationId, status: 'active' },
    });
    if (!active) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'STAR_CHAT_SESSION_REQUIRED',
          message: 'Start a star chat session first',
        },
      });
    }
  }

  private async endStaleSessions() {
    const cutoff = new Date(Date.now() - 90_000);
    const stale = await this.prisma.starChatSession.findMany({
      where: {
        status: 'active',
        payerHeartbeatAt: { lt: cutoff },
      },
    });
    for (const s of stale) {
      await this.endSession(s.payerId, s.id, 'stale').catch((e) =>
        this.logger.warn(String(e)),
      );
    }
  }

  /**
   * Mirrors the conversation's participants into Firestore (`conversations/{id}.members`) so the
   * security rules only let members read / write its realtime messages. Called by a member before
   * subscribing, and after any membership change.
   */
  async syncFirebaseAccess(userId: bigint, conversationId: bigint) {
    await this.requireParticipant(userId, conversationId);
    const ok = await this.pushConversationMembers(conversationId);
    return { ok };
  }

  private async pushConversationMembers(conversationId: bigint): Promise<boolean> {
    const parts = await this.prisma.conversationParticipant.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    return this.fcm.setConversationMembers(
      conversationId,
      parts.map((p) => p.userId),
    );
  }

  private async requireParticipant(userId: bigint, conversationId: bigint) {
    const part = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      include: { conversation: { select: { id: true, type: true } } },
    });
    if (!part) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Not a participant' },
      });
    }
    return part;
  }

  private async settings() {
    let row = await this.prisma.adminSetting.findUnique({ where: { id: 1 } });
    if (!row) row = await this.prisma.adminSetting.create({ data: { id: 1 } });
    return row;
  }

  private serializeMessage(
    m: {
      id: bigint;
      conversationId: bigint;
      senderId: bigint;
      messageType: string;
      messageText: string | null;
      messageMedia: string | null;
      giftId: bigint | null;
      stickerId: bigint | null;
      status: string;
      clientUuid: string | null;
      createdAt: Date;
      sender?: {
        displayName: string | null;
        name: string | null;
        avatarUrl: string | null;
      };
    },
    sender?: {
      displayName: string | null;
      name: string | null;
      avatarUrl: string | null;
    },
  ) {
    const s = m.sender ?? sender;
    return {
      id: Number(m.id),
      conversation_id: Number(m.conversationId),
      sender_id: Number(m.senderId),
      sender_name: s?.displayName ?? s?.name ?? null,
      sender_avatar: s?.avatarUrl ?? null,
      message_type: m.messageType,
      message_text: m.messageText,
      message: m.messageText,
      message_media: m.messageMedia,
      image_url: m.messageMedia,
      gift_id: m.giftId ? Number(m.giftId) : null,
      sticker_id: m.stickerId ? Number(m.stickerId) : null,
      status: m.status,
      client_uuid: m.clientUuid,
      created_at: m.createdAt.toISOString(),
    };
  }

  private serializeSession(s: {
    id: bigint;
    payerId: bigint;
    starUserId: bigint;
    conversationId: bigint;
    status: string;
    startedAt: Date;
    endedAt: Date | null;
    payerHeartbeatAt: Date | null;
    pricePerMin: number;
    commissionPercent: unknown;
    coinsCharged: bigint;
    gemsCredited: bigint;
    endReason: string | null;
  }) {
    const elapsed = Math.max(
      0,
      Math.ceil((Date.now() - s.startedAt.getTime()) / 60_000),
    );
    return {
      id: Number(s.id),
      payer_id: Number(s.payerId),
      star_user_id: Number(s.starUserId),
      conversation_id: Number(s.conversationId),
      status: s.status,
      started_at: s.startedAt.toISOString(),
      ended_at: s.endedAt?.toISOString() ?? null,
      payer_heartbeat_at: s.payerHeartbeatAt?.toISOString() ?? null,
      price_per_min: s.pricePerMin,
      commission_percent: Number(s.commissionPercent),
      coins_charged: Number(s.coinsCharged),
      gems_credited: Number(s.gemsCredited),
      end_reason: s.endReason,
      accrued_coins: elapsed * s.pricePerMin,
    };
  }
}

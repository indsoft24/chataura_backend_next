import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LedgerService } from '../wallet/ledger.service';
import { ChatEvents } from './chat.events';

@Injectable()
export class ChatService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly events: ChatEvents,
  ) {}

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
            participants: { include: { user: true } },
            messages: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
      skip: (Math.max(page, 1) - 1) * take,
      take,
      orderBy: { conversation: { updatedAt: 'desc' } },
    });
    return Promise.all(
      parts.map(async (p) => {
        const c = p.conversation;
        const other = c.participants.find((x) => x.userId !== userId)?.user;
        const last = c.messages[0];
        const unread = await this.prisma.message.count({
          where: {
            conversationId: c.id,
            senderId: { not: userId },
            createdAt: { gt: p.lastReadAt ?? new Date(0) },
          },
        });
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
                is_online: other.isOnline,
                last_seen_at: other.lastSeenAt?.toISOString() ?? null,
                selected_frame_id: other.selectedFrameId
                  ? Number(other.selectedFrameId)
                  : null,
              }
            : null,
          members: c.participants.map((m) => ({
            id: Number(m.user.id),
            name: m.user.displayName ?? m.user.name,
            avatar_url: m.user.avatarUrl,
          })),
        };
      }),
    );
  }

  async withUser(userId: bigint, otherId: bigint) {
    if (userId === otherId) {
      throw new BadRequestException({
        success: false,
        error: { code: 'INVALID', message: 'Cannot chat with yourself' },
      });
    }
    const mine = await this.prisma.conversationParticipant.findMany({
      where: { userId },
      include: { conversation: { include: { participants: true } } },
    });
    const existing = mine.find(
      (p) =>
        p.conversation.type === 'private' &&
        p.conversation.participants.some((x) => x.userId === otherId) &&
        p.conversation.participants.length === 2,
    );
    if (existing) {
      const other = await this.prisma.user.findUniqueOrThrow({
        where: { id: otherId },
      });
      return {
        conversation_id: Number(existing.conversationId),
        name: other.displayName ?? other.name,
        image_url: other.avatarUrl,
      };
    }
    const other = await this.prisma.user.findUniqueOrThrow({
      where: { id: otherId },
    });
    const convo = await this.prisma.conversation.create({
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
  }

  async markRead(userId: bigint, conversationId: bigint) {
    await this.requireParticipant(userId, conversationId);
    await this.prisma.conversationParticipant.update({
      where: {
        conversationId_userId: { conversationId, userId },
      },
      data: { lastReadAt: new Date() },
    });
    return { ok: true };
  }

  async deleteConversation(userId: bigint, conversationId: bigint) {
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!convo) {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Conversation not found' },
      });
    }
    if (convo.type !== 'private') {
      throw new ForbiddenException({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Cannot delete group conversations' },
      });
    }
    await this.requireParticipant(userId, conversationId);
    await this.prisma.conversation.delete({ where: { id: conversationId } });
    return { message: 'Conversation deleted' };
  }

  async messages(userId: bigint, conversationId: bigint, page = 1, limit = 50) {
    await this.requireParticipant(userId, conversationId);
    const take = Math.min(Math.max(limit, 1), 100);
    const rows = await this.prisma.message.findMany({
      where: { conversationId },
      include: { sender: true },
      orderBy: { createdAt: 'desc' },
      skip: (Math.max(page, 1) - 1) * take,
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
    await this.requireParticipant(userId, conversationId);
    const type = body.message_type ?? body.type ?? 'text';
    if (type === 'sticker') {
      throw new ForbiddenException({
        success: false,
        error: { code: 'FEATURE_DISABLED', message: 'Stickers are disabled' },
      });
    }
    await this.assertStarChatAllowed(userId, conversationId);

    const text = body.message_text ?? body.message ?? null;
    const media = body.image_url ?? body.message_media ?? null;
    const sender = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const msg = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: userId,
        messageType: type,
        messageText: text,
        messageMedia: media,
        giftId: body.gift_id ? BigInt(body.gift_id) : null,
        status: 'sent',
        clientUuid: body.client_uuid ?? null,
      },
      include: { sender: true },
    });
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
    const payload = this.serializeMessage(msg, sender);
    const others = await this.prisma.conversationParticipant.findMany({
      where: { conversationId, userId: { not: userId } },
    });
    for (const o of others) {
      this.events.emitReceive(o.userId.toString(), payload);
    }
    return payload;
  }

  async listGroups(userId: bigint) {
    const parts = await this.prisma.conversationParticipant.findMany({
      where: { userId, conversation: { type: 'group' } },
      include: {
        conversation: { include: { participants: true } },
      },
      orderBy: { conversation: { updatedAt: 'desc' } },
    });
    return parts.map((p) => ({
      id: Number(p.conversationId),
      name: p.conversation.name ?? 'Group',
      image_url: p.conversation.imageUrl,
      member_count: p.conversation.participants.length,
      conversation_id: Number(p.conversationId),
      owner_id: Number(p.conversation.participants[0]?.userId ?? userId),
    }));
  }

  async createGroup(
    userId: bigint,
    body: { name: string; image?: string; members?: Array<number | string> },
  ) {
    const memberIds = new Set<bigint>([userId]);
    for (const m of body.members ?? []) memberIds.add(BigInt(m));
    const convo = await this.prisma.conversation.create({
      data: {
        type: 'group',
        name: body.name,
        imageUrl: body.image ?? null,
        participants: {
          create: [...memberIds].map((id) => ({ userId: id })),
        },
      },
      include: { participants: true },
    });
    return {
      id: Number(convo.id),
      name: convo.name,
      image_url: convo.imageUrl,
      member_count: convo.participants.length,
      conversation_id: Number(convo.id),
      owner_id: Number(userId),
    };
  }

  async groupMembers(userId: bigint, groupId: bigint) {
    await this.requireParticipant(userId, groupId);
    const parts = await this.prisma.conversationParticipant.findMany({
      where: { conversationId: groupId },
      include: { user: true },
      orderBy: { id: 'asc' },
    });
    const ownerId = parts[0]?.userId;
    return parts.map((p) => ({
      id: Number(p.userId),
      user_id: Number(p.userId),
      name: p.user.displayName ?? p.user.name,
      avatar: p.user.avatarUrl,
      avatar_url: p.user.avatarUrl,
      is_admin: p.userId === ownerId,
      is_owner: p.userId === ownerId,
    }));
  }

  async leaveGroup(userId: bigint, groupId: bigint) {
    await this.requireParticipant(userId, groupId);
    await this.prisma.conversationParticipant.delete({
      where: { conversationId_userId: { conversationId: groupId, userId } },
    });
    return { message: 'Left group' };
  }

  async deleteGroup(userId: bigint, groupId: bigint) {
    const parts = await this.prisma.conversationParticipant.findMany({
      where: { conversationId: groupId },
      orderBy: { id: 'asc' },
    });
    if (parts[0]?.userId !== userId) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Owner only' },
      });
    }
    await this.prisma.conversation.delete({ where: { id: groupId } });
    return { message: 'Group deleted' };
  }

  async addGroupMembers(
    userId: bigint,
    groupId: bigint,
    members: Array<number | string>,
  ) {
    await this.requireParticipant(userId, groupId);
    for (const m of members) {
      await this.prisma.conversationParticipant.upsert({
        where: {
          conversationId_userId: {
            conversationId: groupId,
            userId: BigInt(m),
          },
        },
        create: { conversationId: groupId, userId: BigInt(m) },
        update: {},
      });
    }
    return this.groupMembers(userId, groupId);
  }

  async removeGroupMember(userId: bigint, groupId: bigint, targetId: bigint) {
    const parts = await this.prisma.conversationParticipant.findMany({
      where: { conversationId: groupId },
      orderBy: { id: 'asc' },
    });
    if (parts[0]?.userId !== userId) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Owner only' },
      });
    }
    await this.prisma.conversationParticipant.deleteMany({
      where: { conversationId: groupId, userId: targetId },
    });
    return { message: 'Member removed' };
  }

  async updateGroup(
    userId: bigint,
    groupId: bigint,
    body: { image_url?: string; name?: string },
  ) {
    await this.requireParticipant(userId, groupId);
    const convo = await this.prisma.conversation.update({
      where: { id: groupId },
      data: {
        ...(body.image_url !== undefined ? { imageUrl: body.image_url } : {}),
        ...(body.name !== undefined ? { name: body.name } : {}),
      },
    });
    return {
      id: Number(convo.id),
      name: convo.name,
      image_url: convo.imageUrl,
      conversation_id: Number(convo.id),
    };
  }

  uploadImageStub() {
    return {
      url: `https://cdn.chataura.local/chat/${Date.now()}.jpg`,
    };
  }

  async updateStatus(
    userId: bigint,
    body: { conversation_id?: number | string; message_id?: number | string; status?: string },
  ) {
    if (body.conversation_id) {
      await this.markRead(userId, BigInt(body.conversation_id));
    }
    if (body.message_id) {
      await this.prisma.message.updateMany({
        where: { id: BigInt(body.message_id) },
        data: { status: body.status ?? 'read' },
      });
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
    await this.prisma.message.delete({ where: { id: messageId } });
    return { message: 'Deleted' };
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
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
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
    const existing = await this.prisma.starChatSession.findFirst({
      where: { conversationId, status: 'active' },
    });
    if (existing) return this.serializeSession(existing);
    const settings = await this.settings();
    const session = await this.prisma.starChatSession.create({
      data: {
        conversationId,
        payerId: userId,
        starUserId: BigInt(preview.star_user_id),
        pricePerMin: settings.starChatPricePerMin,
        commissionPercent: settings.starChatCommissionPct,
        payerHeartbeatAt: new Date(),
      },
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
    const commission = BigInt(
      Math.floor(Number(coins) * (Number(session.commissionPercent) / 100)),
    );
    const gems = coins - commission;

    await this.prisma.$transaction(async (tx) => {
      try {
        await this.ledger.debitCoins(
          tx,
          session.payerId,
          coins,
          'STAR_CHAT',
          'Star chat session',
          `star_chat_${session.id}`,
        );
      } catch (e) {
        if ((e as { code?: string }).code === 'INSUFFICIENT_BALANCE') {
          const locked = await this.ledger.lockUser(tx, session.payerId);
          const available = locked?.wallet_balance ?? 0n;
          if (available > 0n) {
            await this.ledger.debitCoins(
              tx,
              session.payerId,
              available,
              'STAR_CHAT',
              'Star chat session (partial)',
              `star_chat_${session.id}`,
            );
          }
        } else {
          throw e;
        }
      }
      await tx.user.update({
        where: { id: session.starUserId },
        data: { gems: { increment: gems } },
      });
      await tx.starChatSession.update({
        where: { id: session.id },
        data: {
          status: 'ended',
          endedAt: new Date(),
          coinsCharged: coins,
          gemsCredited: gems,
          endReason: reason,
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

  private async requireParticipant(userId: bigint, conversationId: bigint) {
    const part = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
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

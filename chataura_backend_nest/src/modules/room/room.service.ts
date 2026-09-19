import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, RoomMemberRole } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LedgerService } from '../wallet/ledger.service';
import { AgoraService } from './agora.service';
import { RoomEvents } from './room.events';

const STALE_MS = 90_000;
const KICK_SECONDS = 600;

type UserLite = {
  id: bigint;
  name: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  level: number;
  selectedFrameId: bigint | null;
};

@Injectable()
export class RoomService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RoomService.name);
  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly agora: AgoraService,
    private readonly events: RoomEvents,
  ) {}

  onModuleInit() {
    this.cleanupTimer = setInterval(() => {
      void this.cleanupStaleMembers().catch((e) =>
        this.logger.warn(`stale cleanup: ${String(e)}`),
      );
    }, 30_000);
  }

  onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  async list(query: {
    page?: number;
    limit?: number;
    sort?: string;
    country?: string;
    owner_id?: string;
    following?: string;
    friends?: string;
    viewerId?: bigint;
  }) {
    const take = Math.min(Math.max(Number(query.limit ?? 20), 1), 100);
    const page = Math.max(Number(query.page ?? 1), 1);
    const where: Prisma.RoomWhereInput = { isLive: true };
    if (query.country) {
      where.OR = [
        { countryCode: query.country },
        { allowedCountry: query.country },
        { allowedCountry: null },
      ];
    }
    if (query.owner_id) where.ownerId = BigInt(query.owner_id);
    if (query.following === '1' && query.viewerId) {
      const following = await this.prisma.userFollower.findMany({
        where: { followerId: query.viewerId, status: 'accepted' },
        select: { followingId: true },
      });
      where.ownerId = { in: following.map((f) => f.followingId) };
    }
    if (query.friends === '1' && query.viewerId) {
      const friends = await this.prisma.friendship.findMany({
        where: { userId: query.viewerId },
        select: { friendId: true },
      });
      where.ownerId = { in: friends.map((f) => f.friendId) };
    }
    const orderBy: Prisma.RoomOrderByWithRelationInput =
      query.sort === 'popular'
        ? { members: { _count: 'desc' } }
        : { lastActivityAt: 'desc' };
    const rooms = await this.prisma.room.findMany({
      where,
      include: {
        owner: true,
        host: true,
        coHost: true,
        theme: true,
        _count: { select: { members: { where: { isActive: true } } } },
      },
      orderBy,
      skip: (page - 1) * take,
      take,
    });
    const globalVideo = await this.isGlobalVideoEnabled();
    return rooms.map((r) => this.serializeRoom(r, globalVideo));
  }

  async mine(userId: bigint, page = 1, limit = 50) {
    const take = Math.min(Math.max(limit, 1), 100);
    const rooms = await this.prisma.room.findMany({
      where: { ownerId: userId, OR: [{ isLive: true }, { isPermanent: true }] },
      include: {
        owner: true,
        host: true,
        coHost: true,
        theme: true,
        _count: { select: { members: { where: { isActive: true } } } },
      },
      skip: (Math.max(page, 1) - 1) * take,
      take,
      orderBy: { createdAt: 'desc' },
    });
    const globalVideo = await this.isGlobalVideoEnabled();
    return rooms.map((r) => this.serializeRoom(r, globalVideo));
  }

  async themes() {
    const rows = await this.prisma.roomTheme.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    });
    return rows.map((t) => ({
      id: Number(t.id),
      name: t.name,
      image_url: t.imageUrl,
      coin_cost: t.coinCost,
    }));
  }

  async show(id: string) {
    const room = await this.findRoom(id, true);
    const globalVideo = await this.isGlobalVideoEnabled();
    return this.serializeRoom(room, globalVideo);
  }

  async create(
    userId: bigint,
    body: {
      title: string;
      max_seats?: number;
      settings?: {
        allow_video?: boolean;
        allow_gifts?: boolean;
        allow_games?: boolean;
      };
      cover_image_url?: string;
      description?: string;
      tags?: string[];
      allowed_gender?: string;
      country_code?: string;
      allowed_country?: string;
      min_age?: number;
      max_age?: number;
      theme_id?: number;
    },
  ) {
    const maxSeats = Math.min(Math.max(Number(body.max_seats ?? 8), 1), 20);
    const displayId = await this.uniqueDisplayId();
    const globalVideo = await this.isGlobalVideoEnabled();
    const isAudioOnly = body.settings?.allow_video === false;
    const room = await this.prisma.room.create({
      data: {
        title: body.title,
        displayId,
        ownerId: userId,
        hostId: userId,
        agoraChannelName: `room_${displayId}`,
        maxSeats,
        settings: {
          allow_video: globalVideo && !isAudioOnly,
          audio_only: isAudioOnly,
          allow_gifts: body.settings?.allow_gifts ?? true,
          allow_games: body.settings?.allow_games ?? true,
        },
        coverImageUrl: body.cover_image_url ?? null,
        description: body.description ?? null,
        tags: body.tags ?? [],
        allowedGender: body.allowed_gender ?? null,
        countryCode: body.country_code ?? null,
        allowedCountry: body.allowed_country ?? null,
        minAge: body.min_age ?? null,
        maxAge: body.max_age ?? null,
        themeId: body.theme_id ? BigInt(body.theme_id) : null,
        lastActivityAt: new Date(),
        hostLastHeartbeatAt: new Date(),
      },
      include: {
        owner: true,
        host: true,
        coHost: true,
        theme: true,
        _count: { select: { members: true } },
      },
    });
    await this.ensureSeats(room.id, maxSeats);
    return this.serializeRoom(room, globalVideo);
  }

  async update(userId: bigint, id: string, body: Record<string, unknown>) {
    const room = await this.findRoom(id);
    const isHost = room.hostId === userId;
    const isCoHost = room.coHostId === userId;
    if (!isHost && !isCoHost) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only host can update this room' },
      });
    }
    if (isCoHost && !isHost) {
      if (body.theme_id === undefined) {
        throw new ForbiddenException({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Co-host may only change theme',
          },
        });
      }
      const updated = await this.prisma.room.update({
        where: { id: room.id },
        data: { themeId: BigInt(String(body.theme_id)) },
        include: {
          owner: true,
          host: true,
          coHost: true,
          theme: true,
          _count: { select: { members: { where: { isActive: true } } } },
        },
      });
      const globalVideo = await this.isGlobalVideoEnabled();
      return this.serializeRoom(updated, globalVideo);
    }
    const updated = await this.prisma.room.update({
      where: { id: room.id },
      data: {
        ...(typeof body.title === 'string' ? { title: body.title } : {}),
        ...(typeof body.cover_image_url === 'string'
          ? { coverImageUrl: body.cover_image_url }
          : {}),
        ...(typeof body.description === 'string'
          ? { description: body.description }
          : {}),
        ...(body.settings ? { settings: body.settings } : {}),
        ...(body.theme_id !== undefined
          ? { themeId: BigInt(String(body.theme_id)) }
          : {}),
      },
      include: {
        owner: true,
        host: true,
        coHost: true,
        theme: true,
        _count: { select: { members: { where: { isActive: true } } } },
      },
    });
    const globalVideo = await this.isGlobalVideoEnabled();
    return this.serializeRoom(updated, globalVideo);
  }

  async remove(userId: bigint, id: string) {
    const room = await this.findRoom(id);
    if (room.ownerId !== userId && room.hostId !== userId) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only host can close this room' },
      });
    }
    if (room.isPermanent) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'ROOM_PERMANENT',
          message: 'This room cannot be closed',
        },
      });
    }
    await this.prisma.room.update({
      where: { id: room.id },
      data: { isLive: false, endedAt: new Date() },
    });
    await this.prisma.roomMember.updateMany({
      where: { roomId: room.id },
      data: { isActive: false },
    });
    return { message: 'Room closed' };
  }

  async join(userId: bigint, id: string) {
    const room = await this.findRoom(id, true);
    if (!room.isLive) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'NOT_ELIGIBLE', message: 'Room is not live' },
      });
    }
    await this.assertNotBlocked(room.id, userId);

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const agoraUid = this.agoraUid(userId);
    const member = await this.prisma.$transaction(async (tx) => {
      let role: RoomMemberRole = 'listener';
      const liveHost = room.hostId
        ? await tx.roomMember.findFirst({
            where: { roomId: room.id, userId: room.hostId, isActive: true },
          })
        : null;
      if (room.hostId === userId) {
        role = 'host';
      } else if (room.coHostId === userId && liveHost) {
        role = 'co_host';
      } else if (!liveHost) {
        const updated = await tx.room.updateMany({
          where: { id: room.id, OR: [{ hostId: null }, { hostId: room.hostId }] },
          data: { hostId: userId, hostLastHeartbeatAt: new Date() },
        });
        if (updated.count > 0) {
          role = 'host';
        }
      }

      const m = await tx.roomMember.upsert({
        where: { roomId_userId: { roomId: room.id, userId } },
        create: {
          roomId: room.id,
          userId,
          role,
          agoraUid,
          isActive: true,
          lastHeartbeatAt: new Date(),
        },
        update: {
          isActive: true,
          role,
          agoraUid,
          lastHeartbeatAt: new Date(),
        },
      });
      await tx.room.update({
        where: { id: room.id },
        data: { lastActivityAt: new Date() },
      });
      return m;
    });

    const publisher = ['host', 'co_host', 'speaker'].includes(member.role);
    const token = this.agora.buildToken(
      room.agoraChannelName,
      agoraUid,
      publisher,
    );
    const fresh = await this.findRoom(room.id, true);
    const globalVideo = await this.isGlobalVideoEnabled();
    return {
      room: this.serializeRoom(fresh, globalVideo),
      member: this.serializeMember(member, user),
      ...token,
      media_defaults: { mic_on: false, camera_on: false },
      join_event: {
        type: 'join',
        uid: agoraUid,
        user_id: Number(userId),
        displayName: user.displayName ?? user.name,
        display_name: user.displayName ?? user.name,
        avatar: user.avatarUrl,
        avatar_url: user.avatarUrl,
        suppressed: false,
      },
    };
  }

  async leave(userId: bigint, id: string) {
    const room = await this.findRoom(id);
    let roomEnded = false;
    await this.prisma.$transaction(async (tx) => {
      await tx.roomMember.updateMany({
        where: { roomId: room.id, userId },
        data: { isActive: false, seatIndex: null, role: 'listener' },
      });
      await tx.seat.updateMany({
        where: { roomId: room.id, userId },
        data: { userId: null, isMuted: false, mutedByUserId: null },
      });
      if (room.hostId === userId) {
        const lockedRoom = await tx.$queryRaw<
          Array<{ id: string; host_id: bigint | null; is_permanent: boolean }>
        >`SELECT id, host_id, is_permanent FROM rooms WHERE id = ${room.id}::uuid FOR UPDATE`;
        if (lockedRoom[0]?.host_id === userId) {
          const successor = await this.pickHostSuccessor(room.id, userId, tx);
          if (successor) {
            await tx.room.update({
              where: { id: room.id },
              data: { hostId: successor, hostLastHeartbeatAt: new Date() },
            });
            await tx.roomMember.updateMany({
              where: { roomId: room.id, userId: successor },
              data: { role: 'host' },
            });
          } else if (room.isPermanent) {
            await tx.room.update({
              where: { id: room.id },
              data: { hostId: null },
            });
          } else {
            await tx.room.update({
              where: { id: room.id },
              data: { isLive: false, endedAt: new Date(), hostId: null },
            });
            roomEnded = true;
          }
        }
      }
    });
    return {
      message: 'Left room',
      bonus_earned: [],
      room_ended: roomEnded,
      is_permanent: room.isPermanent,
    };
  }

  async heartbeat(userId: bigint, id: string) {
    const room = await this.findRoom(id);
    await this.prisma.roomMember.updateMany({
      where: { roomId: room.id, userId, isActive: true },
      data: { lastHeartbeatAt: new Date() },
    });
    await this.prisma.seat.updateMany({
      where: { roomId: room.id, userId },
      data: { lastHeartbeatAt: new Date() },
    });
    if (room.hostId === userId) {
      await this.prisma.room.update({
        where: { id: room.id },
        data: { hostLastHeartbeatAt: new Date(), lastActivityAt: new Date() },
      });
    }
    return {
      ok: true,
      bonus_earned: [],
      agency_linked: false,
      agency_cashback: null,
    };
  }

  async token(userId: bigint, id: string, uid?: string) {
    const room = await this.findRoom(id);
    const member = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId: room.id, userId } },
    });
    const agoraUid = uid ? Number(uid) : this.agoraUid(userId);
    const publisher = ['host', 'co_host', 'speaker'].includes(
      member?.role ?? 'listener',
    );
    return this.agora.buildToken(room.agoraChannelName, agoraUid, publisher);
  }

  async users(id: string) {
    const room = await this.findRoom(id);
    const members = await this.prisma.roomMember.findMany({
      where: { roomId: room.id, isActive: true },
      include: { user: true },
    });
    return {
      users: members.map((m) => this.serializeMember(m, m.user)),
    };
  }

  async isBlocked(userId: bigint, id: string) {
    const room = await this.findRoom(id);
    const blocked = await this.activeBlock(room.id, userId);
    return { is_blocked: !!blocked, room_id: room.id };
  }

  async blockedUsers(actorId: bigint, id: string) {
    const room = await this.findRoom(id);
    this.assertHost(room, actorId);
    const rows = await this.prisma.roomBlock.findMany({
      where: {
        roomId: room.id,
        kind: 'block',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: { user: true },
      orderBy: { id: 'desc' },
    });
    return rows.map((r) => ({
      user_id: Number(r.userId),
      name: r.user.displayName ?? r.user.name,
      avatar: r.user.avatarUrl,
      blocked_at: r.createdAt.toISOString(),
    }));
  }

  async block(
    actorId: bigint,
    id: string,
    targetId: bigint,
    reason?: string,
    kind = 'block',
  ) {
    const room = await this.findRoom(id);
    this.assertHost(room, actorId);
    if (targetId === room.ownerId) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Cannot block the owner' },
      });
    }
    await this.prisma.roomBlock.create({
      data: {
        roomId: room.id,
        userId: targetId,
        reason: reason ?? null,
        kind,
        expiresAt:
          kind === 'kick' ? new Date(Date.now() + KICK_SECONDS * 1000) : null,
      },
    });
    await this.prisma.roomMember.updateMany({
      where: { roomId: room.id, userId: targetId },
      data: { isActive: false, seatIndex: null, role: 'listener' },
    });
    await this.prisma.seat.updateMany({
      where: { roomId: room.id, userId: targetId },
      data: { userId: null },
    });
    return { message: kind === 'kick' ? 'User kicked' : 'User blocked' };
  }

  async kick(actorId: bigint, id: string, targetId: bigint, reason?: string) {
    return this.block(actorId, id, targetId, reason, 'kick');
  }

  async unblock(actorId: bigint, id: string, targetId: bigint) {
    const room = await this.findRoom(id);
    this.assertHost(room, actorId);
    await this.prisma.roomBlock.deleteMany({
      where: { roomId: room.id, userId: targetId },
    });
    return { message: 'User unblocked' };
  }

  async setCoHost(actorId: bigint, id: string, targetId: bigint) {
    const room = await this.findRoom(id);
    this.assertHost(room, actorId);
    await this.prisma.room.update({
      where: { id: room.id },
      data: { coHostId: targetId },
    });
    await this.prisma.roomMember.updateMany({
      where: { roomId: room.id, userId: targetId },
      data: { role: 'co_host' },
    });
    return { message: 'Co-host assigned' };
  }

  async transferHost(actorId: bigint, id: string, targetId: bigint) {
    const room = await this.findRoom(id);
    this.assertHost(room, actorId);
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        Array<{ id: string; host_id: bigint | null }>
      >`SELECT id, host_id FROM rooms WHERE id = ${room.id}::uuid FOR UPDATE`;
      if (!locked[0] || locked[0].host_id !== actorId) {
        throw new ForbiddenException({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Host only' },
        });
      }
      await tx.room.update({
        where: { id: room.id },
        data: {
          hostId: targetId,
          coHostId: room.coHostId === targetId ? null : room.coHostId,
          hostLastHeartbeatAt: new Date(),
        },
      });
      await tx.roomMember.updateMany({
        where: { roomId: room.id, userId: targetId },
        data: { role: 'host' },
      });
      await tx.roomMember.updateMany({
        where: { roomId: room.id, userId: actorId },
        data: { role: 'speaker' },
      });
      return { message: 'Host transferred' };
    });
  }

  async seats(userId: bigint | null | undefined, id: string) {
    const room = await this.findRoom(id);
    await this.ensureSeats(room.id, room.maxSeats);
    return this.seatsSnapshot(room.id, userId, room.maxSeats);
  }

  async takeSeat(userId: bigint, id: string, seatIndex: number) {
    const room = await this.findRoom(id);
    const member = await this.requireActiveMember(room.id, userId);
    if (!['host', 'co_host', 'speaker'].includes(member.role)) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Audience cannot take a seat. Wait for host to assign.',
        },
      });
    }
    await this.occupySeat(room, userId, seatIndex, member.role);
    const snap = await this.seatsSnapshot(room.id, userId, room.maxSeats);
    this.events.emitSeatUpdated(room.id, snap);
    return { ...snap, rtc_role: 'publisher' };
  }

  async assignSeat(
    actorId: bigint,
    id: string,
    seatIndex: number,
    targetId: bigint,
  ) {
    const room = await this.findRoom(id);
    this.assertHost(room, actorId);
    await this.requireActiveMember(room.id, targetId);
    await this.occupySeat(room, targetId, seatIndex, 'speaker');
    await this.prisma.roomMember.updateMany({
      where: { roomId: room.id, userId: targetId, role: 'listener' },
      data: { role: 'speaker' },
    });
    const snap = await this.seatsSnapshot(room.id, actorId, room.maxSeats);
    this.events.emitSeatUpdated(room.id, snap);
    return { ...snap, rtc_role: 'publisher' };
  }

  async leaveSeat(userId: bigint, id: string) {
    const room = await this.findRoom(id);
    await this.prisma.seat.updateMany({
      where: { roomId: room.id, userId },
      data: { userId: null, isMuted: false, mutedByUserId: null },
    });
    const member = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId: room.id, userId } },
    });
    if (member && member.role === 'speaker') {
      await this.prisma.roomMember.update({
        where: { id: member.id },
        data: { role: 'listener', seatIndex: null },
      });
    } else if (member) {
      await this.prisma.roomMember.update({
        where: { id: member.id },
        data: { seatIndex: null },
      });
    }
    const snap = await this.seatsSnapshot(room.id, userId, room.maxSeats);
    this.events.emitSeatUpdated(room.id, snap);
    return snap;
  }

  async freeSeat(actorId: bigint, id: string, seatIndex: number) {
    const room = await this.findRoom(id);
    this.assertHostOrCoHost(room, actorId);
    const seat = await this.prisma.seat.findUnique({
      where: { roomId_seatIndex: { roomId: room.id, seatIndex } },
    });
    if (seat?.userId && seat.userId === room.hostId) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Cannot evict the host' },
      });
    }
    const demoted = seat?.userId ?? null;
    if (demoted) {
      await this.prisma.seat.update({
        where: { id: seat!.id },
        data: { userId: null, isMuted: false, mutedByUserId: null },
      });
      await this.prisma.roomMember.updateMany({
        where: { roomId: room.id, userId: demoted, role: 'speaker' },
        data: { role: 'listener', seatIndex: null },
      });
    }
    const snap = await this.seatsSnapshot(room.id, actorId, room.maxSeats);
    this.events.emitSeatUpdated(room.id, snap);
    return { ...snap, demoted_user_id: demoted ? Number(demoted) : null };
  }

  async muteSeat(
    actorId: bigint,
    id: string,
    seatIndex: number,
    muted: boolean,
  ) {
    const room = await this.findRoom(id);
    const seat = await this.prisma.seat.findUnique({
      where: { roomId_seatIndex: { roomId: room.id, seatIndex } },
    });
    if (!seat)
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Seat not found' },
      });
    const isHost = room.hostId === actorId;
    const isCoHost = room.coHostId === actorId;
    const isSelf = seat.userId === actorId;
    if (!isHost && !isCoHost && !isSelf) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Cannot mute this seat' },
      });
    }
    if (
      isSelf &&
      !isHost &&
      seat.mutedByUserId &&
      seat.mutedByUserId !== actorId
    ) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'HOST_MUTED', message: 'You were muted by the host' },
      });
    }
    if (isCoHost && !isHost && seat.userId === room.hostId) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Cannot mute the host' },
      });
    }
    await this.prisma.seat.update({
      where: { id: seat.id },
      data: {
        isMuted: muted,
        mutedByUserId: muted ? actorId : null,
      },
    });
    const snap = await this.seatsSnapshot(room.id, actorId, room.maxSeats);
    this.events.emitSeatUpdated(room.id, snap);
    return { ...snap, muted_by_user_id: muted ? Number(actorId) : null };
  }

  async reduceSeats(actorId: bigint, id: string) {
    const room = await this.findRoom(id);
    this.assertHost(room, actorId);
    if (room.maxSeats <= 1) {
      throw new BadRequestException({
        success: false,
        error: { code: 'MIN_SEATS', message: 'Minimum 1 seat' },
      });
    }
    const last = room.maxSeats - 1;
    await this.prisma.seat.updateMany({
      where: { roomId: room.id, seatIndex: last },
      data: { userId: null },
    });
    await this.prisma.seat.deleteMany({
      where: { roomId: room.id, seatIndex: last },
    });
    await this.prisma.room.update({
      where: { id: room.id },
      data: { maxSeats: last },
    });
    const snap = await this.seatsSnapshot(room.id, actorId, last);
    this.events.emitSeatUpdated(room.id, snap);
    return { ...snap, message: 'Seat removed' };
  }

  async stickers(userId?: bigint | null) {
    const rows = await this.prisma.sticker.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    });
    const owned = userId
      ? await this.prisma.userUnlockedSticker.findMany({
          where: { userId },
        })
      : [];
    const ownedIds = new Set(owned.map((o) => o.stickerId.toString()));
    return rows.map((s) => ({
      id: Number(s.id),
      name: s.name,
      coin_cost: s.coinCost,
      image_url: s.imageUrl,
      animation_url: s.animationUrl,
      owned: s.coinCost === 0 || ownedIds.has(s.id.toString()),
    }));
  }

  async purchaseSticker(userId: bigint, stickerId: bigint) {
    const sticker = await this.prisma.sticker.findFirst({
      where: { id: stickerId, isActive: true },
    });
    if (!sticker) {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Sticker not found' },
      });
    }
    if (sticker.coinCost > 0) {
      await this.prisma.$transaction(async (tx) => {
        const already = await tx.userUnlockedSticker.findUnique({
          where: { userId_stickerId: { userId, stickerId } },
        });
        if (already) return;
        try {
          await this.ledger.debitCoins(
            tx,
            userId,
            sticker.coinCost,
            'STICKER',
            `Sticker: ${sticker.name}`,
            `sticker_${sticker.id}`,
          );
        } catch (e) {
          if ((e as { code?: string }).code === 'INSUFFICIENT_BALANCE') {
            throw new BadRequestException({
              success: false,
              error: {
                code: 'INSUFFICIENT_BALANCE',
                message: 'Insufficient coin balance',
              },
            });
          }
          throw e;
        }
        await tx.userUnlockedSticker.upsert({
          where: { userId_stickerId: { userId, stickerId } },
          create: { userId, stickerId, coinsPaid: sticker.coinCost },
          update: {},
        });
      });
    } else {
      await this.prisma.userUnlockedSticker.upsert({
        where: { userId_stickerId: { userId, stickerId } },
        create: { userId, stickerId, coinsPaid: 0 },
        update: {},
      });
    }
    return {
      sticker_id: Number(sticker.id),
      owned: true,
      coins_paid: sticker.coinCost,
    };
  }

  async sendSticker(
    userId: bigint,
    id: string,
    body: {
      sticker_id: number | string;
      receiver_id?: number;
      quantity?: number;
    },
  ) {
    const room = await this.findRoom(id);
    await this.requireActiveMember(room.id, userId);
    const sticker = await this.prisma.sticker.findFirst({
      where: { id: BigInt(body.sticker_id), isActive: true },
    });
    if (!sticker) {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Sticker not found' },
      });
    }
    if (sticker.coinCost > 0) {
      const owned = await this.prisma.userUnlockedSticker.findUnique({
        where: { userId_stickerId: { userId, stickerId: sticker.id } },
      });
      if (!owned) {
        throw new ForbiddenException({
          success: false,
          error: { code: 'NOT_OWNED', message: 'Sticker not owned' },
        });
      }
    }
    const quantity = Math.min(Math.max(Number(body.quantity ?? 1), 1), 100);
    return {
      sticker_id: Number(sticker.id),
      quantity,
      image_url: sticker.imageUrl,
      animation_url: sticker.animationUrl,
      total_cost: 0,
      owned: true,
    };
  }

  private async occupySeat(
    room: { id: string; hostId: bigint | null },
    userId: bigint,
    seatIndex: number,
    role: RoomMemberRole,
  ) {
    await this.ensureSeats(room.id, undefined);
    return this.prisma.$transaction(async (tx) => {
      await tx.seat.updateMany({
        where: { roomId: room.id, userId, seatIndex: { not: seatIndex } },
        data: { userId: null, isMuted: false, mutedByUserId: null },
      });

      const claim = await tx.seat.updateMany({
        where: {
          roomId: room.id,
          seatIndex,
          OR: [{ userId: null }, { userId }],
        },
        data: {
          userId,
          lastHeartbeatAt: new Date(),
          isMuted: false,
          mutedByUserId: null,
        },
      });

      if (claim.count === 0) {
        throw new BadRequestException({
          success: false,
          error: { code: 'SEAT_TAKEN', message: 'Seat already taken' },
        });
      }

      await tx.roomMember.updateMany({
        where: { roomId: room.id, userId },
        data: { seatIndex, role: role === 'listener' ? 'speaker' : role },
      });
    });
  }

  private async seatsSnapshot(
    roomId: string,
    viewerId: bigint | null | undefined,
    maxSeats: number,
  ) {
    const seats = await this.prisma.seat.findMany({
      where: { roomId, seatIndex: { lt: maxSeats } },
      include: { user: { include: { selectedFrame: true } } },
      orderBy: { seatIndex: 'asc' },
    });
    const member = viewerId
      ? await this.prisma.roomMember.findUnique({
          where: { roomId_userId: { roomId, userId: viewerId } },
        })
      : null;
    const seated = viewerId ? seats.find((s) => s.userId === viewerId) : undefined;
    const role = member?.role ?? 'listener';
    const rtc =
      seated || ['host', 'co_host', 'speaker'].includes(role)
        ? 'publisher'
        : 'audience';
    return {
      seats: seats.map((s) => ({
        seat_index: s.seatIndex,
        user_id: s.userId ? Number(s.userId) : null,
        agora_uid: s.userId ? this.agoraUid(s.userId) : null,
        display_name: s.user?.displayName ?? s.user?.name ?? null,
        avatar: s.user?.avatarUrl ?? null,
        avatar_url: s.user?.avatarUrl ?? null,
        is_muted: s.isMuted,
        muted_by_user_id: s.mutedByUserId ? Number(s.mutedByUserId) : null,
        is_locked: s.isLocked,
        selected_frame_id: s.user?.selectedFrameId
          ? Number(s.user.selectedFrameId)
          : null,
        selected_frame_url: s.user?.selectedFrame?.imageUrl ?? null,
        selected_frame_url_lite: s.user?.selectedFrame?.imageUrl ?? null,
        selected_frame_url_hq: s.user?.selectedFrame?.imageUrl ?? null,
        rtc_role: s.userId ? 'publisher' : null,
      })),
      max_seats: maxSeats,
      viewer: {
        user_id: Number(viewerId),
        is_seated: !!seated,
        seat_index: seated?.seatIndex ?? null,
        role,
        rtc_role: rtc,
      },
      rtc_role: rtc,
    };
  }

  private async ensureSeats(roomId: string, maxSeats?: number) {
    const room = await this.prisma.room.findUniqueOrThrow({
      where: { id: roomId },
    });
    const target = maxSeats ?? room.maxSeats;
    const existing = await this.prisma.seat.findMany({ where: { roomId } });
    const have = new Set(existing.map((s) => s.seatIndex));
    const creates = [];
    for (let i = 0; i < target; i++) {
      if (!have.has(i)) creates.push({ roomId, seatIndex: i });
    }
    if (creates.length) await this.prisma.seat.createMany({ data: creates });
  }

  private async cleanupStaleMembers() {
    const cutoff = new Date(Date.now() - STALE_MS);
    const stale = await this.prisma.roomMember.findMany({
      where: {
        isActive: true,
        lastHeartbeatAt: { lt: cutoff },
        role: { not: 'host' },
      },
    });
    for (const m of stale) {
      await this.prisma.roomMember.update({
        where: { id: m.id },
        data: { role: 'listener', seatIndex: null, isActive: false },
      });
      await this.prisma.seat.updateMany({
        where: { roomId: m.roomId, userId: m.userId },
        data: { userId: null, isMuted: false, mutedByUserId: null },
      });
    }
  }

  private async findRoom(id: string, withUsers = false) {
    const include = withUsers
      ? {
          owner: true,
          host: true,
          coHost: true,
          theme: true,
          _count: { select: { members: { where: { isActive: true } } } },
        }
      : {
          owner: true,
          host: true,
          coHost: true,
          theme: true,
          _count: { select: { members: { where: { isActive: true } } } },
        };
    const room = id.includes('-')
      ? await this.prisma.room.findUnique({ where: { id }, include })
      : await this.prisma.room.findUnique({
          where: { displayId: id },
          include,
        });
    if (!room) {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Room not found' },
      });
    }
    return room;
  }

  private async requireActiveMember(roomId: string, userId: bigint) {
    const member = await this.prisma.roomMember.findFirst({
      where: { roomId, userId, isActive: true },
    });
    if (!member) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'NOT_IN_ROOM', message: 'Join the room first' },
      });
    }
    return member;
  }

  private async activeBlock(roomId: string, userId: bigint) {
    return this.prisma.roomBlock.findFirst({
      where: {
        roomId,
        userId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
  }

  private async assertNotBlocked(roomId: string, userId: bigint) {
    const block = await this.activeBlock(roomId, userId);
    if (!block) return;
    if (block.kind === 'kick' && block.expiresAt) {
      const retry = Math.max(
        0,
        Math.ceil((block.expiresAt.getTime() - Date.now()) / 1000),
      );
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'ROOM_KICK_COOLDOWN',
          message: 'You were recently kicked from this room',
          retry_after_seconds: retry,
        },
      });
    }
    throw new ForbiddenException({
      success: false,
      error: {
        code: 'ROOM_BLOCKED',
        message: 'You are blocked from this room',
      },
    });
  }

  private async pickHostSuccessor(
    roomId: string,
    exceptUserId: bigint,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const room = await client.room.findUniqueOrThrow({
      where: { id: roomId },
    });
    if (room.coHostId && room.coHostId !== exceptUserId) {
      const co = await client.roomMember.findFirst({
        where: { roomId, userId: room.coHostId, isActive: true },
      });
      if (co) return room.coHostId;
    }
    const next = await client.roomMember.findFirst({
      where: {
        roomId,
        isActive: true,
        userId: { not: exceptUserId },
        role: { in: ['speaker', 'co_host'] },
      },
      orderBy: { joinedAt: 'asc' },
    });
    if (next) return next.userId;
    const any = await client.roomMember.findFirst({
      where: { roomId, isActive: true, userId: { not: exceptUserId } },
      orderBy: { joinedAt: 'asc' },
    });
    return any?.userId ?? null;
  }

  private assertHost(
    room: { ownerId: bigint; hostId: bigint | null },
    userId: bigint,
  ) {
    if (room.hostId !== userId) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Host only' },
      });
    }
  }

  private assertHostOrCoHost(
    room: { ownerId: bigint; hostId: bigint | null; coHostId: bigint | null },
    userId: bigint,
  ) {
    if (room.hostId !== userId && room.coHostId !== userId) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Host or co-host only' },
      });
    }
  }

  private async uniqueDisplayId() {
    for (let i = 0; i < 20; i++) {
      const id = String(100000 + Math.floor(Math.random() * 900000));
      const exists = await this.prisma.room.findUnique({
        where: { displayId: id },
      });
      if (!exists) return id;
    }
    return String(Date.now()).slice(-6);
  }

  private agoraUid(userId: bigint) {
    return Number(userId % 2_147_483_647n);
  }

  private serializeMember(
    member: {
      id: bigint;
      roomId?: string;
      userId: bigint;
      role: string;
      seatIndex: number | null;
      agoraUid: number | null;
      joinedAt?: Date;
    },
    user: UserLite,
  ) {
    return {
      id: Number(member.id),
      room_id: member.roomId,
      user_id: Number(member.userId),
      role: member.role,
      seat_index: member.seatIndex,
      agora_uid: member.agoraUid ?? this.agoraUid(member.userId),
      display_name: user.displayName ?? user.name,
      avatar_url: user.avatarUrl,
      joined_at: member.joinedAt?.toISOString(),
    };
  }

  private async isGlobalVideoEnabled(): Promise<boolean> {
    try {
      const setting = await this.prisma.adminSetting.findUnique({
        where: { id: 1 },
        select: { extraSettings: true },
      });
      const extra = (setting?.extraSettings as Record<string, unknown>) ?? {};
      return extra.room_video_enabled !== false;
    } catch {
      return true;
    }
  }

  private serializeRoom(
    room: {
      id: string;
      displayId: string;
      title: string;
      ownerId: bigint;
      hostId: bigint | null;
      coHostId: bigint | null;
      agoraChannelName: string;
      maxSeats: number;
      isLive: boolean;
      isPermanent: boolean;
      coverImageUrl: string | null;
      description: string | null;
      tags: Prisma.JsonValue;
      settings: Prisma.JsonValue;
      countryCode: string | null;
      allowedCountry: string | null;
      allowedGender: string | null;
      minAge: number | null;
      maxAge: number | null;
      owner?: UserLite | null;
      host?: UserLite | null;
      coHost?: UserLite | null;
      theme?: { id: bigint; name: string; imageUrl: string | null } | null;
      _count?: { members: number };
    },
    globalVideoEnabled = true,
  ) {
    const rawSettings = (room.settings as Record<string, unknown>) ?? {};
    const allowVideo = globalVideoEnabled && rawSettings.audio_only !== true;

    return {
      id: room.id,
      display_id: room.displayId,
      title: room.title,
      owner_id: Number(room.ownerId),
      host_id: room.hostId ? Number(room.hostId) : null,
      co_host_id: room.coHostId ? Number(room.coHostId) : null,
      agora_channel_name: room.agoraChannelName,
      max_seats: room.maxSeats,
      is_live: room.isLive,
      is_permanent: room.isPermanent,
      cover_image_url: room.coverImageUrl,
      description: room.description,
      tags: room.tags ?? [],
      settings: {
        allow_video: allowVideo,
        audio_only: rawSettings.audio_only === true,
        allow_gifts: rawSettings.allow_gifts !== false,
        allow_games: rawSettings.allow_games !== false,
      },
      country_code: room.countryCode,
      allowed_country: room.allowedCountry,
      allowed_gender: room.allowedGender,
      min_age: room.minAge,
      max_age: room.maxAge,
      members_count: room._count?.members ?? 0,
      agency_linked: false,
      agency_cashback: null,
      gift_animation: {
        big_threshold_coins: 5000,
        banner_duration_small_ms: 3000,
        banner_duration_big_ms: 6000,
        banner_duration_coin_divisor: 0,
        banner_duration_min_ms: 1500,
        banner_duration_max_ms: 6000,
      },
      owner: room.owner
        ? {
            id: Number(room.owner.id),
            name: room.owner.displayName ?? room.owner.name,
            avatar_url: room.owner.avatarUrl,
          }
        : null,
      host: room.host
        ? {
            id: Number(room.host.id),
            name: room.host.displayName ?? room.host.name,
            avatar_url: room.host.avatarUrl,
          }
        : null,
      co_host: room.coHost
        ? {
            id: Number(room.coHost.id),
            name: room.coHost.displayName ?? room.coHost.name,
            avatar_url: room.coHost.avatarUrl,
          }
        : null,
      theme: room.theme
        ? {
            id: Number(room.theme.id),
            name: room.theme.name,
            image_url: room.theme.imageUrl,
          }
        : null,
    };
  }
}

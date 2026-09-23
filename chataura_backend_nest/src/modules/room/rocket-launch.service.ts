import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LedgerService } from '../wallet/ledger.service';
import { RoomEvents } from './room.events';

const ROCKET_PRICE = 100_000;
const COIN_POOL_RATIO = 0.5;
const ADMIN_LIMIT = 5;
const COOLDOWN_MS = 20_000;
const FRAME_DAYS = 3;
const FRAME_WINNERS = 3;

type MemberRow = {
  userId: bigint;
  xp: bigint;
  name: string;
  avatarUrl: string | null;
};

@Injectable()
export class RocketLaunchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly events: RoomEvents,
  ) {}

  async state(actorId: bigint, roomKey: string) {
    const room = await this.findRoom(roomKey);
    const admins = await this.adminRows(room.id);
    const member = await this.prisma.roomMember.findFirst({
      where: { roomId: room.id, userId: actorId, isActive: true },
    });
    return this.serializeState(room, admins, actorId, Boolean(member));
  }

  async addAdmin(actorId: bigint, roomKey: string, targetId: bigint) {
    const room = await this.findRoom(roomKey);
    this.assertManager(room, actorId);
    if (targetId === room.hostId || targetId === room.coHostId || targetId === room.ownerId) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Host and co-host can already launch the rocket',
        },
      });
    }
    const member = await this.prisma.roomMember.findFirst({
      where: { roomId: room.id, userId: targetId, isActive: true },
    });
    if (!member) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'NOT_IN_ROOM',
          message: 'That user is not joined in this room',
        },
      });
    }
    const count = await this.prisma.roomRocketAdmin.count({
      where: { roomId: room.id },
    });
    const existing = await this.prisma.roomRocketAdmin.findUnique({
      where: { roomId_userId: { roomId: room.id, userId: targetId } },
    });
    if (!existing && count >= ADMIN_LIMIT) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `A room can have at most ${ADMIN_LIMIT} rocket admins`,
        },
      });
    }
    if (!existing) {
      await this.prisma.roomRocketAdmin.create({
        data: { roomId: room.id, userId: targetId },
      });
    }
    return this.state(actorId, room.id);
  }

  async removeAdmin(actorId: bigint, roomKey: string, targetId: bigint) {
    const room = await this.findRoom(roomKey);
    this.assertManager(room, actorId);
    await this.prisma.roomRocketAdmin.deleteMany({
      where: { roomId: room.id, userId: targetId },
    });
    return this.state(actorId, room.id);
  }

  async launch(actorId: bigint, roomKey: string) {
    const room = await this.findRoom(roomKey);
    const member = await this.prisma.roomMember.findFirst({
      where: { roomId: room.id, userId: actorId, isActive: true },
    });
    if (!member) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'NOT_IN_ROOM', message: 'Join the room before launching' },
      });
    }
    const admins = await this.adminRows(room.id);
    const allowed =
      this.isManager(room, actorId) ||
      admins.some((a) => a.userId === actorId);
    if (!allowed) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only the host, co-host, and room admins can launch the rocket',
        },
      });
    }

    const recent = await this.prisma.rocketLaunch.findFirst({
      where: { roomId: room.id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (recent && Date.now() - recent.createdAt.getTime() < COOLDOWN_MS) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'ROCKET_COOLDOWN',
          message: 'A rocket was just launched in this room. Wait a moment.',
        },
      });
    }

    const members = await this.joinedMembers(room.id);
    if (members.length === 0) {
      throw new BadRequestException({
        success: false,
        error: { code: 'NOT_IN_ROOM', message: 'No joined users to reward' },
      });
    }

    const fraction = 0.4 + Math.random() * 0.2;
    const winnerCount = Math.max(
      1,
      Math.min(members.length, Math.round(members.length * fraction)),
    );
    const winners = weightedSample(members, winnerCount);
    const coinPool = Math.floor(ROCKET_PRICE * COIN_POOL_RATIO);
    const coinShares = splitCoins(coinPool, winners.map((w) => Math.max(1, Number(w.xp))));
    const frames = await this.prisma.frame.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
      take: FRAME_WINNERS,
    });

    const launchId = randomUUID();
    const ranked = winners
      .map((w, i) => ({
        user: w,
        coins: coinShares[i] ?? 0,
        xp: Math.max(20, Math.round((coinShares[i] ?? 0) * 0.02)),
      }))
      .sort((a, b) => b.coins - a.coins || Number(b.user.xp - a.user.xp));

    let senderBalance = 0n;
    try {
      senderBalance = await this.prisma.$transaction(
        async (tx) => {
          const ids = [actorId, ...ranked.map((r) => r.user.userId)];
          const locked = await this.ledger.lockUsers(tx, ids);
          const launcher = locked.get(actorId.toString());
          if (!launcher) {
            throw Object.assign(new Error('USER_NOT_FOUND'), { code: 'USER_NOT_FOUND' });
          }
          const { after } = await this.ledger.debitCoins(
            tx,
            actorId,
            ROCKET_PRICE,
            'ROCKET',
            'Rocket launch',
            `rocket_${launchId}`,
            launcher,
            {
              source: 'rocket',
              currency: 'coins',
              room_id: room.id,
              launch_id: launchId,
              coin_pool: coinPool,
            },
            'rocket',
          );

          const expires = new Date(Date.now() + FRAME_DAYS * 24 * 60 * 60 * 1000);
          for (let i = 0; i < ranked.length; i++) {
            const row = ranked[i];
            const frame = i < frames.length ? frames[i] : null;
            if (row.coins > 0) {
              await this.ledger.creditCoins(
                tx,
                row.user.userId,
                row.coins,
                'ROCKET_REWARD',
                'Rocket reward',
                `rocket_reward_${launchId}_${row.user.userId}`,
                null,
                {
                  source: 'rocket',
                  currency: 'coins',
                  room_id: room.id,
                  launch_id: launchId,
                },
              );
            }
            if (row.xp > 0) {
              await tx.user.update({
                where: { id: row.user.userId },
                data: {
                  xp: { increment: row.xp },
                  exp: { increment: row.xp },
                },
              });
            }
            if (frame) {
              await tx.userUnlockedFrame.upsert({
                where: {
                  userId_frameId: { userId: row.user.userId, frameId: frame.id },
                },
                create: {
                  userId: row.user.userId,
                  frameId: frame.id,
                  coinsPaid: 0,
                  unlockType: 'rocket',
                  durationDays: FRAME_DAYS,
                  expiresAt: expires,
                },
                update: {
                  unlockType: 'rocket',
                  durationDays: FRAME_DAYS,
                  expiresAt: expires,
                },
              });
            }
          }

          await tx.rocketLaunch.create({
            data: {
              id: launchId,
              roomId: room.id,
              launcherId: actorId,
              price: ROCKET_PRICE,
              coinPool,
              joinedCount: members.length,
              winnerCount: ranked.length,
              rewards: {
                create: ranked.map((row, i) => ({
                  userId: row.user.userId,
                  coins: row.coins,
                  xp: row.xp,
                  frameId: i < frames.length ? frames[i].id : null,
                  frameName: i < frames.length ? frames[i].name : null,
                  frameDays: i < frames.length ? FRAME_DAYS : null,
                })),
              },
            },
          });
          return after;
        },
        { timeout: 20_000 },
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

    const payload = await this.launchPayload(launchId, senderBalance);
    this.events.emitRocketLaunch(room.id, payload);
    return payload;
  }

  async getLaunch(roomKey: string, launchId: string) {
    const room = await this.findRoom(roomKey);
    const row = await this.prisma.rocketLaunch.findFirst({
      where: { id: launchId, roomId: room.id },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Rocket launch not found' },
      });
    }
    return this.launchPayload(launchId, null);
  }

  private async launchPayload(launchId: string, senderBalance: bigint | null) {
    const launch = await this.prisma.rocketLaunch.findUniqueOrThrow({
      where: { id: launchId },
      include: {
        launcher: { select: { id: true, displayName: true, name: true, avatarUrl: true } },
        rewards: {
          include: {
            user: { select: { id: true, displayName: true, name: true, avatarUrl: true } },
          },
        },
      },
    });
    const rewards = [...launch.rewards].sort((a, b) => b.coins - a.coins);
    return {
      launch_id: launch.id,
      price: launch.price,
      coin_pool: launch.coinPool,
      joined_count: launch.joinedCount,
      winner_count: launch.winnerCount,
      sender_balance_after:
        senderBalance == null ? null : Number(senderBalance),
      launcher: {
        id: Number(launch.launcher.id),
        name: launch.launcher.displayName || launch.launcher.name || 'Host',
        avatar_url: launch.launcher.avatarUrl,
      },
      rewards: rewards.map((r) => ({
        user_id: Number(r.userId),
        name: r.user.displayName || r.user.name || 'User',
        avatar_url: r.user.avatarUrl,
        coins: r.coins,
        xp: r.xp,
        frame_id: r.frameId == null ? null : Number(r.frameId),
        frame_name: r.frameName,
        frame_days: r.frameDays,
      })),
    };
  }

  private async serializeState(
    room: { id: string; hostId: bigint | null; coHostId: bigint | null; ownerId: bigint },
    admins: Array<{
      userId: bigint;
      user: { displayName: string | null; name: string | null; avatarUrl: string | null };
    }>,
    actorId: bigint,
    joined: boolean,
  ) {
    const manager = this.isManager(room, actorId);
    const isAdmin = admins.some((a) => a.userId === actorId);
    return {
      price: ROCKET_PRICE,
      coin_pool_ratio: COIN_POOL_RATIO,
      admin_limit: ADMIN_LIMIT,
      can_manage: manager,
      can_launch: joined && (manager || isAdmin),
      admins: admins.map((a) => ({
        id: Number(a.userId),
        name: a.user.displayName || a.user.name || 'User',
        avatar_url: a.user.avatarUrl,
      })),
    };
  }

  private adminRows(roomId: string) {
    return this.prisma.roomRocketAdmin.findMany({
      where: { roomId },
      orderBy: { id: 'asc' },
      include: {
        user: { select: { displayName: true, name: true, avatarUrl: true } },
      },
    });
  }

  private async joinedMembers(roomId: string): Promise<MemberRow[]> {
    const rows = await this.prisma.roomMember.findMany({
      where: { roomId, isActive: true },
      include: {
        user: { select: { id: true, xp: true, displayName: true, name: true, avatarUrl: true } },
      },
    });
    return rows.map((r) => ({
      userId: r.userId,
      xp: r.user.xp,
      name: r.user.displayName || r.user.name || 'User',
      avatarUrl: r.user.avatarUrl,
    }));
  }

  private isManager(
    room: { hostId: bigint | null; coHostId: bigint | null; ownerId: bigint },
    userId: bigint,
  ) {
    return userId === room.hostId || userId === room.coHostId || userId === room.ownerId;
  }

  private assertManager(
    room: { hostId: bigint | null; coHostId: bigint | null; ownerId: bigint },
    userId: bigint,
  ) {
    if (!this.isManager(room, userId)) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only the host or co-host can choose rocket admins',
        },
      });
    }
  }

  private async findRoom(id: string) {
    const room = id.includes('-')
      ? await this.prisma.room.findUnique({ where: { id } })
      : await this.prisma.room.findUnique({ where: { displayId: id } });
    if (!room) {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Room not found' },
      });
    }
    return room;
  }
}

function weightedSample<T extends { xp: bigint }>(rows: T[], count: number): T[] {
  const pool = [...rows];
  const picked: T[] = [];
  while (picked.length < count && pool.length > 0) {
    const total = pool.reduce((sum, row) => sum + Math.max(1, Number(row.xp)), 0);
    let ticket = Math.random() * total;
    let index = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      ticket -= Math.max(1, Number(pool[i].xp));
      if (ticket <= 0) {
        index = i;
        break;
      }
    }
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}

function splitCoins(pool: number, weights: number[]): number[] {
  if (weights.length === 0 || pool <= 0) return weights.map(() => 0);
  const minEach = pool >= weights.length ? 1 : 0;
  let remaining = pool - minEach * weights.length;
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const shares = weights.map((w) => minEach + Math.floor((remaining * w) / sum));
  const used = shares.reduce((a, b) => a + b, 0);
  if (shares.length > 0 && used < pool) shares[0] += pool - used;
  return shares;
}

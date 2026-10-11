import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  ROOM_REWARD_SETTING_KEYS,
  readRoomRewardSettings,
  roomRewardSettingsForApi,
} from './room-reward.config';
import { RewardLevel, levelTotal, nextLevel, validateLevelTable } from './room-reward.levels';
import { RoomRewardService } from './room-reward.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type LevelInput = {
  level?: unknown;
  min_visitors?: unknown;
  min_room_coins?: unknown;
  owner_reward?: unknown;
  partner_reward?: unknown;
  partner_count?: unknown;
  is_active?: unknown;
};

function toInt(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim());
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}

function toBig(raw: unknown): bigint {
  const s = String(raw ?? '').trim();
  return /^-?\d+$/.test(s) ? BigInt(s) : -1n;
}

/** Admin (super admin panel) side of Room Reward Levels. */
@Injectable()
export class RoomRewardAdminService {
  private readonly logger = new Logger(RoomRewardAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rewards: RoomRewardService,
  ) {}

  private levelForApi(l: RewardLevel, paidCount = 0) {
    return {
      level: l.level,
      min_visitors: l.minVisitors,
      min_room_coins: Number(l.minRoomCoins),
      owner_reward: Number(l.ownerReward),
      partner_reward: Number(l.partnerReward),
      partner_count: l.partnerCount,
      total_reward: Number(levelTotal(l)),
      is_active: l.isActive,
      rooms_paid: paidCount,
    };
  }

  private parseLevels(body: { levels?: LevelInput[] }): RewardLevel[] {
    if (!Array.isArray(body?.levels)) {
      throw new BadRequestException({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'levels must be an array' },
      });
    }
    return body.levels.map((r) => ({
      level: toInt(r.level),
      minVisitors: toInt(r.min_visitors),
      minRoomCoins: toBig(r.min_room_coins),
      ownerReward: toBig(r.owner_reward),
      partnerReward: toBig(r.partner_reward),
      partnerCount: toInt(r.partner_count),
      isActive: r.is_active !== false && r.is_active !== 'false',
    }));
  }

  private async paidCounts(): Promise<Map<number, number>> {
    const rows = await this.prisma.roomRewardPayout.groupBy({ by: ['level'], _count: { _all: true } });
    return new Map(rows.map((r) => [r.level, r._count._all]));
  }

  async overview() {
    const [agg, rooms, pending, recipients] = await Promise.all([
      this.prisma.roomRewardPayout.aggregate({ _sum: { totalPaid: true }, _count: { _all: true } }),
      this.prisma.roomRewardProgress.count({ where: { lifetimeCoins: { gt: 0 } } }),
      this.prisma.roomRewardProgress.count({ where: { pendingLevel: { not: null } } }),
      this.prisma.roomRewardRecipient.count(),
    ]);
    const { settings } = await this.rewards.config();
    return {
      settings: roomRewardSettingsForApi(settings),
      total_paid: Number(agg._sum.totalPaid ?? 0n),
      payouts: agg._count._all,
      recipients,
      rooms_with_progress: rooms,
      rooms_pending: pending,
    };
  }

  async levels() {
    const [rows, counts] = await Promise.all([
      this.prisma.roomRewardLevel.findMany({ orderBy: { level: 'asc' } }),
      this.paidCounts(),
    ]);
    return {
      levels: rows.map((r) =>
        this.levelForApi(
          {
            level: r.level,
            minVisitors: r.minVisitors,
            minRoomCoins: r.minRoomCoins,
            ownerReward: r.ownerReward,
            partnerReward: r.partnerReward,
            partnerCount: r.partnerCount,
            isActive: r.isActive,
          },
          counts.get(r.level) ?? 0,
        ),
      ),
    };
  }

  /**
   * What saving this table would do: validation issues, and per level how many rooms already
   * have enough lifetime coins and would complete it as soon as their visitor target is met
   * (worst-case coins). Nothing is written.
   */
  async preview(body: { levels?: LevelInput[] }) {
    const levels = this.parseLevels(body);
    const issues = validateLevelTable(levels);
    const active = levels.filter((l) => l.isActive);
    const lowest = active.reduce<bigint | null>(
      (m, l) => (m == null || l.minRoomCoins < m ? l.minRoomCoins : m),
      null,
    );
    const impact: Array<{ level: number; rooms_due: number; max_coins: number }> = [];
    if (issues.length === 0 && lowest != null) {
      const [progress, payouts] = await Promise.all([
        this.prisma.roomRewardProgress.findMany({
          where: { lifetimeCoins: { gte: lowest } },
          select: { roomId: true, lifetimeCoins: true },
        }),
        this.prisma.roomRewardPayout.findMany({ select: { roomId: true, level: true } }),
      ]);
      const paid = new Set(payouts.map((p) => `${p.roomId}:${p.level}`));
      for (const l of active) {
        const due = progress.filter(
          (p) => p.lifetimeCoins >= l.minRoomCoins && !paid.has(`${p.roomId}:${l.level}`),
        ).length;
        if (due > 0) {
          impact.push({ level: l.level, rooms_due: due, max_coins: Number(levelTotal(l)) * due });
        }
      }
    }
    return {
      issues,
      impact,
      max_immediate_coins: impact.reduce((s, i) => s + i.max_coins, 0),
    };
  }

  /**
   * Replace the level table. Levels left out are deleted — or, if any room was already paid for
   * them, deactivated (payout history keeps the exact settings it was paid under). Rooms that
   * already passed a new / changed level are evaluated right after saving.
   */
  async saveLevels(body: { levels?: LevelInput[] }, actorId: bigint) {
    const levels = this.parseLevels(body);
    const issues = validateLevelTable(levels);
    if (issues.length > 0) {
      throw new BadRequestException({
        success: false,
        error: { code: 'INVALID_LEVELS', message: 'The level table has problems', details: issues },
      });
    }
    const counts = await this.paidCounts();
    const keep = new Set(levels.map((l) => l.level));
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.roomRewardLevel.findMany({ select: { level: true } });
      for (const e of existing) {
        if (keep.has(e.level)) continue;
        if ((counts.get(e.level) ?? 0) > 0) {
          await tx.roomRewardLevel.update({ where: { level: e.level }, data: { isActive: false } });
        } else {
          await tx.roomRewardLevel.delete({ where: { level: e.level } });
        }
      }
      for (const l of levels) {
        const data = {
          minVisitors: l.minVisitors,
          minRoomCoins: l.minRoomCoins,
          ownerReward: l.ownerReward,
          partnerReward: l.partnerReward,
          partnerCount: l.partnerCount,
          isActive: l.isActive,
        };
        await tx.roomRewardLevel.upsert({
          where: { level: l.level },
          create: { level: l.level, ...data },
          update: data,
        });
      }
    });
    this.logger.log(`Room reward levels saved by admin ${actorId}: ${levels.length} levels`);
    void this.rewards
      .evaluateAllEligible()
      .then((n) => n > 0 && this.logger.log(`Level catch-up paid ${n} level(s)`))
      .catch((e) => this.logger.error(`Level catch-up failed: ${String(e)}`));
    return this.levels();
  }

  async settings() {
    const { settings } = await this.rewards.config();
    return { settings: roomRewardSettingsForApi(settings) };
  }

  async updateSettings(body: Record<string, unknown>, actorId: bigint) {
    const current = await this.prisma.adminSetting.findUnique({ where: { id: 1 } });
    const extra = { ...((current?.extraSettings as Record<string, unknown>) ?? {}) };
    for (const key of Object.values(ROOM_REWARD_SETTING_KEYS)) {
      if (body[key] !== undefined) extra[key] = body[key];
    }
    // Store the clamped values, so what's saved is exactly what the engine uses.
    const clean = roomRewardSettingsForApi(readRoomRewardSettings(extra));
    Object.assign(extra, clean);
    await this.prisma.adminSetting.upsert({
      where: { id: 1 },
      create: { id: 1, extraSettings: extra as Prisma.InputJsonValue },
      update: { extraSettings: extra as Prisma.InputJsonValue },
    });
    this.rewards.invalidateConfig();
    this.logger.log(`Room reward settings updated by admin ${actorId}: ${JSON.stringify(clean)}`);
    return { settings: clean };
  }

  /** Live view: rooms by lifetime coins, with next level and pending state. */
  async rooms(q: { search?: string; pending?: string; page?: string; limit?: string }) {
    const take = Math.min(Math.max(Number(q.limit ?? 25) || 25, 1), 100);
    const page = Math.max(Number(q.page ?? 1) || 1, 1);
    const search = (q.search ?? '').trim();
    const where: Prisma.RoomRewardProgressWhereInput = {
      ...(q.pending === 'true' ? { pendingLevel: { not: null } } : {}),
      ...(search
        ? {
            room: {
              OR: [
                ...(UUID_RE.test(search) ? [{ id: search }] : []),
                { displayId: search },
                { title: { contains: search, mode: 'insensitive' as const } },
              ],
            },
          }
        : {}),
    };
    const [total, rows, payouts] = await Promise.all([
      this.prisma.roomRewardProgress.count({ where }),
      this.prisma.roomRewardProgress.findMany({
        where,
        include: {
          room: {
            select: {
              id: true,
              displayId: true,
              title: true,
              ownerId: true,
              owner: { select: { displayName: true, name: true, displayId: true } },
            },
          },
        },
        orderBy: { lifetimeCoins: 'desc' },
        skip: (page - 1) * take,
        take,
      }),
      this.prisma.roomRewardPayout.findMany({ select: { roomId: true, level: true } }),
    ]);
    const { levels } = await this.rewards.config();
    const paidBy = new Map<string, Set<number>>();
    for (const p of payouts) {
      if (!paidBy.has(p.roomId)) paidBy.set(p.roomId, new Set());
      paidBy.get(p.roomId)!.add(p.level);
    }
    return {
      total,
      page,
      rooms: rows.map((r) => {
        const next = nextLevel(levels, paidBy.get(r.roomId) ?? new Set());
        return {
          room_id: r.roomId,
          room_display_id: r.room.displayId,
          room_title: r.room.title,
          owner_id: Number(r.room.ownerId),
          owner_name: r.room.owner?.displayName ?? r.room.owner?.name ?? null,
          owner_display_id: r.room.owner?.displayId ?? null,
          lifetime_coins: Number(r.lifetimeCoins),
          last_level: r.lastLevel,
          last_level_at: r.lastLevelAt?.toISOString() ?? null,
          pending_level: r.pendingLevel,
          pending_since: r.pendingSince?.toISOString() ?? null,
          next_level: next?.level ?? null,
          next_level_coins: next ? Number(next.minRoomCoins) : null,
          next_level_visitors: next?.minVisitors ?? null,
        };
      }),
    };
  }

  /** Payout history with every recipient and the reason (rank, gifting, stay). */
  async payouts(q: { room?: string; user?: string; page?: string; limit?: string }) {
    const take = Math.min(Math.max(Number(q.limit ?? 25) || 25, 1), 100);
    const page = Math.max(Number(q.page ?? 1) || 1, 1);
    const room = (q.room ?? '').trim();
    const user = (q.user ?? '').trim();
    let userId: bigint | null = null;
    if (user) {
      const u = await this.prisma.user.findFirst({
        where: { OR: [{ displayId: user }, ...(/^\d{1,18}$/.test(user) ? [{ id: BigInt(user) }] : [])] },
        select: { id: true },
      });
      userId = u?.id ?? -1n;
    }
    const where: Prisma.RoomRewardPayoutWhereInput = {
      ...(room ? (UUID_RE.test(room) ? { roomId: room } : { roomDisplayId: room }) : {}),
      ...(userId != null ? { recipients: { some: { userId } } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.roomRewardPayout.count({ where }),
      this.prisma.roomRewardPayout.findMany({
        where,
        include: { recipients: { orderBy: [{ role: 'desc' }, { rank: 'asc' }] } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * take,
        take,
      }),
    ]);
    const ids = [...new Set(rows.flatMap((r) => r.recipients.map((x) => x.userId)))];
    const users = ids.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, displayName: true, name: true, displayId: true },
        })
      : [];
    const byId = new Map(users.map((u) => [u.id.toString(), u]));
    return {
      total,
      page,
      payouts: rows.map((p) => {
        const base = this.rewards.payoutForApi(p);
        return {
          ...base,
          recipients: base.recipients.map((r) => {
            const u = byId.get(String(r.user_id));
            return { ...r, name: u?.displayName ?? u?.name ?? null, display_id: u?.displayId ?? null };
          }),
        };
      }),
    };
  }
}

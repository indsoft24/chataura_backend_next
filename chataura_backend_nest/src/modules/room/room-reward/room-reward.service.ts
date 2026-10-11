import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { RealtimeService } from '../../../common/fcm/realtime.service';
import { FcmService } from '../../../common/fcm/fcm.service';
import { LedgerService } from '../../wallet/ledger.service';
import { RoomRewardSettings, readRoomRewardSettings } from './room-reward.config';
import { RewardLevel, dueLevels, levelTotal, nextLevel } from './room-reward.levels';
import {
  MIN_LIVENESS_MS,
  RankedPartner,
  giftCountsForRoomReward,
  isQualifiedVisitor,
  nextStayStart,
  rankPartners,
} from './room-reward.rules';

type Tx = Prisma.TransactionClient;

const CONFIG_TTL_MS = 30_000;
const SUMMARY_TTL_MS = 5_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ROOM_REWARD_LEDGER_TYPE = 'ROOM_REWARD';

/** Lightweight progress attached to join / heartbeat / gift responses (cached per room). */
export type RoomRewardSummary = {
  enabled: boolean;
  lifetime_coins: number;
  current_level: number;
  /** Coin target of the last completed level (the meter's start point; 0 before level 1). */
  previous_level_coins: number;
  next_level: ReturnType<typeof levelForApi> | null;
  /** Coins toward the next level, measured from the previous level's target (0–100). */
  progress_percent: number;
  qualified_visitors: number;
  pending_level: number | null;
};

function levelForApi(l: RewardLevel) {
  return {
    level: l.level,
    min_visitors: l.minVisitors,
    min_room_coins: Number(l.minRoomCoins),
    owner_reward: Number(l.ownerReward),
    partner_reward: Number(l.partnerReward),
    partner_count: l.partnerCount,
    total_reward: Number(levelTotal(l)),
  };
}

/**
 * Room Reward Levels engine. Lifetime room gifting (never reset) unlocks admin-defined levels;
 * each level pays the room owner and the top partners exactly once per room.
 *
 * Guarantees:
 * - one payout per (room, level): DB unique key + per-room advisory lock + idempotent ledger refs
 * - levels are paid in order; a level short on qualified visitors waits as "pending" and is
 *   re-checked every minute (coins already gifted are never lost)
 * - levels added later are evaluated against the room's lifetime coins
 */
@Injectable()
export class RoomRewardService {
  private readonly logger = new Logger(RoomRewardService.name);
  private configCache: { at: number; settings: RoomRewardSettings; levels: RewardLevel[] } | null = null;
  private readonly summaryCache = new Map<string, { at: number; value: RoomRewardSummary }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly redis: RedisService,
    private readonly realtime: RealtimeService,
    private readonly fcm: FcmService,
  ) {}

  // ---------------------------------------------------------------- config

  async config(): Promise<{ settings: RoomRewardSettings; levels: RewardLevel[] }> {
    const now = Date.now();
    if (this.configCache && now - this.configCache.at < CONFIG_TTL_MS) return this.configCache;
    const [setting, rows] = await Promise.all([
      this.prisma.adminSetting.findUnique({ where: { id: 1 }, select: { extraSettings: true } }),
      this.prisma.roomRewardLevel.findMany({ orderBy: { level: 'asc' } }),
    ]);
    const settings = readRoomRewardSettings(setting?.extraSettings as Record<string, unknown>);
    const levels: RewardLevel[] = rows.map((r) => ({
      level: r.level,
      minVisitors: r.minVisitors,
      minRoomCoins: r.minRoomCoins,
      ownerReward: r.ownerReward,
      partnerReward: r.partnerReward,
      partnerCount: r.partnerCount,
      isActive: r.isActive,
    }));
    this.configCache = { at: now, settings, levels };
    return this.configCache;
  }

  /** After an admin edits levels / settings: drop caches and re-check rooms (new levels). */
  invalidateConfig() {
    this.configCache = null;
    this.summaryCache.clear();
  }

  // ---------------------------------------------------------------- presence

  /** Stay start to store when a member (re)joins — read BEFORE the join overwrites the heartbeat. */
  async stayStartForJoin(tx: Tx, roomId: string, userId: bigint, now: Date): Promise<Date> {
    const { settings } = await this.config();
    const prev = await tx.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { stayStartedAt: true, lastHeartbeatAt: true },
    });
    return nextStayStart(prev, now, settings.presenceGapMinutes * 60_000);
  }

  /**
   * Heartbeat: refresh liveness and keep / restart the continuous stay in one statement (a
   * silence longer than the allowed gap — app killed, long background — starts a new stay).
   */
  async heartbeatMember(roomId: string, userId: bigint): Promise<void> {
    const { settings } = await this.config();
    const now = new Date();
    const cutoff = new Date(
      now.getTime() - Math.max(settings.presenceGapMinutes * 60_000, MIN_LIVENESS_MS),
    );
    await this.prisma.$executeRaw`
      UPDATE room_members
      SET stay_started_at = CASE
            WHEN stay_started_at IS NULL OR last_heartbeat_at IS NULL OR last_heartbeat_at < ${cutoff}
            THEN ${now} ELSE stay_started_at END,
          last_heartbeat_at = ${now}
      WHERE room_id = ${roomId}::uuid AND user_id = ${userId} AND is_active = true`;
  }

  // ---------------------------------------------------------------- gifting

  /**
   * Inside the gift transaction: add counted coins to the room's lifetime total and the
   * sender's gifting. No-op while the feature is off (rooms start from 0 when it's enabled).
   * Returns true when something was recorded (caller then runs [evaluateSoon]).
   */
  async recordGiftTx(
    tx: Tx,
    p: { roomId: string; ownerId: bigint; senderId: bigint; coins: bigint; category: string | null },
  ): Promise<boolean> {
    const { settings } = await this.config();
    if (!settings.enabled || p.coins <= 0n) return false;
    if (!giftCountsForRoomReward(p.category, p.senderId, p.ownerId)) return false;
    const now = new Date();
    await tx.$executeRaw`
      INSERT INTO room_reward_progress (room_id, lifetime_coins, created_at, updated_at)
      VALUES (${p.roomId}::uuid, ${p.coins}, ${now}, ${now})
      ON CONFLICT (room_id) DO UPDATE
      SET lifetime_coins = room_reward_progress.lifetime_coins + EXCLUDED.lifetime_coins,
          updated_at = EXCLUDED.updated_at`;
    await tx.$executeRaw`
      INSERT INTO room_reward_gifting (room_id, user_id, lifetime_coins, level_coins, last_gift_at)
      VALUES (${p.roomId}::uuid, ${p.senderId}, ${p.coins}, ${p.coins}, ${now})
      ON CONFLICT (room_id, user_id) DO UPDATE
      SET lifetime_coins = room_reward_gifting.lifetime_coins + EXCLUDED.lifetime_coins,
          level_coins = room_reward_gifting.level_coins + EXCLUDED.level_coins,
          last_gift_at = EXCLUDED.last_gift_at`;
    return true;
  }

  /** After the gift committed: check levels without delaying the gift response. */
  evaluateSoon(roomId: string) {
    this.summaryCache.delete(roomId);
    void this.evaluate(roomId).catch((e) =>
      this.logger.error(`evaluate(${roomId}) failed: ${String(e)}`),
    );
  }

  // ---------------------------------------------------------------- engine

  /** Pays every due level of a room, in order, stopping at the first short on visitors. */
  async evaluate(roomId: string): Promise<number> {
    const { settings, levels } = await this.config();
    if (!settings.enabled) return 0;
    const lockKey = `room_reward_eval:${roomId}`;
    const locked = await this.redis
      .getClient()
      .set(lockKey, '1', 'EX', 30, 'NX')
      .catch(() => 'OK');
    if (!locked) return 0;
    try {
      return await this.evaluateLocked(roomId, settings, levels);
    } finally {
      await this.redis.getClient().del(lockKey).catch(() => 0);
      this.summaryCache.delete(roomId);
    }
  }

  private async evaluateLocked(
    roomId: string,
    settings: RoomRewardSettings,
    levels: RewardLevel[],
  ): Promise<number> {
    const progress = await this.prisma.roomRewardProgress.findUnique({ where: { roomId } });
    if (!progress) return 0;
    const paid = new Set(
      (
        await this.prisma.roomRewardPayout.findMany({ where: { roomId }, select: { level: true } })
      ).map((p) => p.level),
    );
    const due = dueLevels(levels, paid, progress.lifetimeCoins);
    if (due.length === 0) {
      if (progress.pendingLevel != null) await this.setPending(roomId, null);
      return 0;
    }
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { id: true, ownerId: true, displayId: true, title: true },
    });
    if (!room) return 0;

    const now = new Date();
    const qualified = await this.qualifiedVisitors(roomId, room.ownerId, settings, now);
    // One gifting snapshot for every level paid in this pass: a single big gift that crosses
    // several levels ranks partners by the same contribution for each of them.
    const gifting = await this.prisma.roomRewardGifting.findMany({
      where: { roomId, userId: { in: qualified.map((q) => q.userId) } },
      select: { userId: true, levelCoins: true },
    });
    const coinsOf = new Map(gifting.map((g) => [g.userId.toString(), g.levelCoins]));
    const candidates = qualified.map((q) => ({
      userId: q.userId,
      giftedCoins: coinsOf.get(q.userId.toString()) ?? 0n,
      stayStartedAt: q.stayStartedAt!,
    }));

    let paidCount = 0;
    for (const level of due) {
      if (qualified.length < level.minVisitors) {
        if (progress.pendingLevel !== level.level) await this.setPending(roomId, level.level);
        break;
      }
      const partners = rankPartners(candidates, level.partnerCount, now);
      const done = await this.payLevel(room, level, progress.lifetimeCoins, qualified.length, partners);
      if (done) paidCount++;
    }
    if (paidCount > 0) {
      // Next level's partner race starts from zero.
      await this.prisma.roomRewardGifting.updateMany({
        where: { roomId, levelCoins: { gt: 0 } },
        data: { levelCoins: 0 },
      });
    }
    return paidCount;
  }

  private async qualifiedVisitors(
    roomId: string,
    ownerId: bigint,
    settings: RoomRewardSettings,
    now: Date,
  ) {
    const members = await this.prisma.roomMember.findMany({
      where: { roomId, isActive: true },
      select: { userId: true, isActive: true, stayStartedAt: true, lastHeartbeatAt: true },
    });
    return members.filter((m) =>
      isQualifiedVisitor(
        m,
        ownerId,
        now,
        settings.presenceMinutes * 60_000,
        settings.presenceGapMinutes * 60_000,
      ),
    );
  }

  private async setPending(roomId: string, level: number | null) {
    await this.prisma.roomRewardProgress.update({
      where: { roomId },
      data: { pendingLevel: level, pendingSince: level == null ? null : new Date() },
    });
  }

  /** Pays one level atomically. Returns false if it was already paid. */
  private async payLevel(
    room: { id: string; ownerId: bigint; displayId: string; title: string },
    level: RewardLevel,
    roomCoins: bigint,
    qualifiedCount: number,
    partners: RankedPartner[],
  ): Promise<boolean> {
    const snapshot = levelForApi(level);
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'room_reward:' + room.id}))`;
      const exists = await tx.roomRewardPayout.findUnique({
        where: { roomId_level: { roomId: room.id, level: level.level } },
        select: { id: true },
      });
      if (exists) return null;

      const meta = { room_id: room.id, room_display_id: room.displayId, level: level.level };
      const ownerRef = `room_reward_${room.id}_${level.level}_owner`;
      let ownerPaid = 0n;
      if (level.ownerReward > 0n) {
        const ownerLock = await this.ledger.lockUser(tx, room.ownerId);
        if (ownerLock) {
          await this.ledger.creditCoins(
            tx,
            room.ownerId,
            level.ownerReward,
            ROOM_REWARD_LEDGER_TYPE,
            `Room level ${level.level} reward (owner)`,
            ownerRef,
            ownerLock,
            { ...meta, role: 'owner' },
          );
          ownerPaid = level.ownerReward;
        }
      }
      const paidPartners: Array<RankedPartner & { ref: string; amount: bigint }> = [];
      for (const p of partners) {
        if (level.partnerReward <= 0n) break;
        const ref = `room_reward_${room.id}_${level.level}_p_${p.userId}`;
        const lock = await this.ledger.lockUser(tx, p.userId);
        if (!lock) continue;
        await this.ledger.creditCoins(
          tx,
          p.userId,
          level.partnerReward,
          ROOM_REWARD_LEDGER_TYPE,
          `Room level ${level.level} reward (partner #${p.rank})`,
          ref,
          lock,
          { ...meta, role: 'partner', rank: p.rank },
        );
        paidPartners.push({ ...p, ref, amount: level.partnerReward });
      }

      const payout = await tx.roomRewardPayout.create({
        data: {
          roomId: room.id,
          roomDisplayId: room.displayId,
          roomTitle: room.title,
          level: level.level,
          ownerId: room.ownerId,
          ownerReward: ownerPaid,
          partnerReward: level.partnerReward,
          partnerSlots: level.partnerCount,
          partnersPaid: paidPartners.length,
          totalPaid: ownerPaid + level.partnerReward * BigInt(paidPartners.length),
          roomCoinsAt: roomCoins,
          qualifiedVisitors: qualifiedCount,
          levelSnapshot: snapshot,
          recipients: {
            create: [
              ...(ownerPaid > 0n
                ? [{ userId: room.ownerId, role: 'owner', amount: ownerPaid, ledgerRef: ownerRef }]
                : []),
              ...paidPartners.map((p) => ({
                userId: p.userId,
                role: 'partner',
                rank: p.rank,
                amount: p.amount,
                giftedCoins: p.giftedCoins,
                staySeconds: p.staySeconds,
                stayStartedAt: p.stayStartedAt,
                ledgerRef: p.ref,
              })),
            ],
          },
        },
      });
      const progress = await tx.roomRewardProgress.findUnique({ where: { roomId: room.id } });
      await tx.roomRewardProgress.update({
        where: { roomId: room.id },
        data: {
          lastLevel: Math.max(progress?.lastLevel ?? 0, level.level),
          lastLevelAt: new Date(),
          pendingLevel: null,
          pendingSince: null,
        },
      });
      return { payout, ownerPaid, paidPartners };
    });
    if (!result) return false;
    void this.announce(room, level, result.ownerPaid, result.paidPartners);
    return true;
  }

  /** Room celebration (server-origin event) + push to every person paid. */
  private async announce(
    room: { id: string; ownerId: bigint },
    level: RewardLevel,
    ownerPaid: bigint,
    partners: Array<RankedPartner & { amount: bigint }>,
  ) {
    try {
      const ids = [room.ownerId, ...partners.map((p) => p.userId)];
      const users = await this.prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, displayName: true, name: true },
      });
      const nameOf = (id: bigint) => {
        const u = users.find((x) => x.id === id);
        return u?.displayName ?? u?.name ?? 'User';
      };
      const event = {
        level: level.level,
        owner: { user_id: Number(room.ownerId), name: nameOf(room.ownerId), amount: Number(ownerPaid) },
        partners: partners.map((p) => ({
          user_id: Number(p.userId),
          name: nameOf(p.userId),
          rank: p.rank,
          amount: Number(p.amount),
        })),
      };
      await this.realtime.publishRoomEvent(room.id, {
        text: `CMD:ROOM_REWARD:${JSON.stringify(event)}`,
      });
      const notify = (userId: bigint, amount: bigint, role: string) =>
        this.fcm.sendUserNotification({
          userId,
          title: `Room level ${level.level} reached! 🎉`,
          body: `You received ${amount.toLocaleString('en-US')} coins as room ${role}.`,
          data: { type: 'room_reward', room_id: room.id, level: String(level.level) },
        });
      if (ownerPaid > 0n) await notify(room.ownerId, ownerPaid, 'owner');
      for (const p of partners) await notify(p.userId, p.amount, 'partner');
    } catch (e) {
      this.logger.warn(`announce(${room.id}, L${level.level}) failed: ${String(e)}`);
    }
  }

  /** Rooms waiting on visitors are re-checked every minute. */
  @Cron('*/1 * * * *')
  async checkPendingRooms(): Promise<void> {
    const { settings } = await this.config();
    if (!settings.enabled) return;
    const rows = await this.prisma.roomRewardProgress.findMany({
      where: { pendingLevel: { not: null } },
      select: { roomId: true },
      take: 500,
    });
    for (const r of rows) {
      await this.evaluate(r.roomId).catch((e) =>
        this.logger.warn(`pending evaluate(${r.roomId}) failed: ${String(e)}`),
      );
    }
  }

  /**
   * After an admin adds / edits levels: rooms whose lifetime coins already reach a level they
   * haven't been paid are evaluated (catch-up for newly added levels).
   */
  async evaluateAllEligible(): Promise<number> {
    this.invalidateConfig();
    const { settings, levels } = await this.config();
    if (!settings.enabled) return 0;
    const lowest = levels.filter((l) => l.isActive).sort((a, b) => (a.minRoomCoins < b.minRoomCoins ? -1 : 1))[0];
    if (!lowest) return 0;
    const rooms = await this.prisma.roomRewardProgress.findMany({
      where: { lifetimeCoins: { gte: lowest.minRoomCoins } },
      select: { roomId: true },
    });
    let paid = 0;
    for (const r of rooms) paid += await this.evaluate(r.roomId).catch(() => 0);
    return paid;
  }

  // ---------------------------------------------------------------- read API

  private async resolveRoomId(idOrDisplay: string): Promise<{ id: string; ownerId: bigint }> {
    const raw = String(idOrDisplay ?? '').trim();
    const room = await this.prisma.room.findFirst({
      where: UUID_RE.test(raw) ? { id: raw } : { displayId: raw },
      select: { id: true, ownerId: true },
    });
    if (!room) {
      throw new NotFoundException({ success: false, error: { code: 'NOT_FOUND', message: 'Room not found' } });
    }
    return room;
  }

  /** Cached per room for a few seconds — safe to attach to every heartbeat / gift response. */
  async summary(roomId: string): Promise<RoomRewardSummary> {
    const cached = this.summaryCache.get(roomId);
    if (cached && Date.now() - cached.at < SUMMARY_TTL_MS) return cached.value;
    const { settings, levels } = await this.config();
    const disabled: RoomRewardSummary = {
      enabled: false,
      lifetime_coins: 0,
      current_level: 0,
      previous_level_coins: 0,
      next_level: null,
      progress_percent: 0,
      qualified_visitors: 0,
      pending_level: null,
    };
    if (!settings.enabled) return disabled;
    const [progress, payouts, room] = await Promise.all([
      this.prisma.roomRewardProgress.findUnique({ where: { roomId } }),
      this.prisma.roomRewardPayout.findMany({ where: { roomId }, select: { level: true } }),
      this.prisma.room.findUnique({ where: { id: roomId }, select: { ownerId: true } }),
    ]);
    if (!room) return disabled;
    const paid = new Set(payouts.map((p) => p.level));
    const coins = progress?.lifetimeCoins ?? 0n;
    const next = nextLevel(levels, paid);
    const prevTarget =
      levels
        .filter((l) => paid.has(l.level) && (!next || l.level < next.level))
        .map((l) => l.minRoomCoins)
        .reduce((a, b) => (b > a ? b : a), 0n) ?? 0n;
    let pct = 100;
    if (next) {
      const span = next.minRoomCoins - prevTarget;
      const done = coins - prevTarget;
      pct = span > 0n ? Math.max(0, Math.min(100, Number((done * 100n) / span))) : 100;
    }
    const qualified = await this.qualifiedVisitors(roomId, room.ownerId, settings, new Date());
    const value: RoomRewardSummary = {
      enabled: true,
      lifetime_coins: Number(coins),
      current_level: progress?.lastLevel ?? 0,
      previous_level_coins: Number(prevTarget),
      next_level: next ? levelForApi(next) : null,
      progress_percent: pct,
      qualified_visitors: qualified.length,
      pending_level: progress?.pendingLevel ?? null,
    };
    this.summaryCache.set(roomId, { at: Date.now(), value });
    return value;
  }

  /** Full progress for the room detail sheet, including the viewer's partner standing. */
  async progressForRoom(idOrDisplay: string, viewerId: bigint) {
    const room = await this.resolveRoomId(idOrDisplay);
    const { settings, levels } = await this.config();
    const summary = await this.summary(room.id);
    const paid = await this.prisma.roomRewardPayout.findMany({
      where: { roomId: room.id },
      select: { level: true, createdAt: true },
    });
    const paidAt = new Map(paid.map((p) => [p.level, p.createdAt]));
    const now = new Date();
    const [mine, member] = await Promise.all([
      this.prisma.roomRewardGifting.findUnique({
        where: { roomId_userId: { roomId: room.id, userId: viewerId } },
        select: { levelCoins: true, lifetimeCoins: true },
      }),
      this.prisma.roomMember.findUnique({
        where: { roomId_userId: { roomId: room.id, userId: viewerId } },
        select: { userId: true, isActive: true, stayStartedAt: true, lastHeartbeatAt: true },
      }),
    ]);
    const qualified = member
      ? isQualifiedVisitor(
          member,
          room.ownerId,
          now,
          settings.presenceMinutes * 60_000,
          settings.presenceGapMinutes * 60_000,
        )
      : false;
    return {
      ...summary,
      presence_minutes: settings.presenceMinutes,
      presence_gap_minutes: settings.presenceGapMinutes,
      levels: levels
        .filter((l) => l.isActive)
        .map((l) => ({
          ...levelForApi(l),
          completed: paidAt.has(l.level),
          completed_at: paidAt.get(l.level)?.toISOString() ?? null,
        })),
      me: {
        is_owner: viewerId === room.ownerId,
        qualified,
        stay_seconds:
          member?.isActive && member.stayStartedAt
            ? Math.max(0, Math.floor((now.getTime() - member.stayStartedAt.getTime()) / 1000))
            : 0,
        gifted_toward_level: Number(mine?.levelCoins ?? 0n),
        gifted_lifetime: Number(mine?.lifetimeCoins ?? 0n),
      },
    };
  }

  async payoutsForRoom(idOrDisplay: string, limit = 50) {
    const room = await this.resolveRoomId(idOrDisplay);
    const rows = await this.prisma.roomRewardPayout.findMany({
      where: { roomId: room.id },
      include: { recipients: { orderBy: [{ role: 'asc' }, { rank: 'asc' }] } },
      orderBy: { level: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
    return rows.map((p) => this.payoutForApi(p));
  }

  async rewardsForUser(userId: bigint, limit = 50) {
    const rows = await this.prisma.roomRewardRecipient.findMany({
      where: { userId },
      include: { payout: true },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
    return rows.map((r) => ({
      role: r.role,
      rank: r.rank,
      amount: Number(r.amount),
      level: r.payout.level,
      room_id: r.payout.roomId,
      room_display_id: r.payout.roomDisplayId,
      room_title: r.payout.roomTitle,
      gifted_coins: Number(r.giftedCoins),
      stay_seconds: r.staySeconds,
      created_at: r.createdAt.toISOString(),
    }));
  }

  payoutForApi(
    p: Prisma.RoomRewardPayoutGetPayload<{ include: { recipients: true } }>,
  ) {
    return {
      id: Number(p.id),
      room_id: p.roomId,
      room_display_id: p.roomDisplayId,
      room_title: p.roomTitle,
      level: p.level,
      owner_id: Number(p.ownerId),
      owner_reward: Number(p.ownerReward),
      partner_reward: Number(p.partnerReward),
      partner_slots: p.partnerSlots,
      partners_paid: p.partnersPaid,
      total_paid: Number(p.totalPaid),
      room_coins_at: Number(p.roomCoinsAt),
      qualified_visitors: p.qualifiedVisitors,
      level_snapshot: p.levelSnapshot,
      created_at: p.createdAt.toISOString(),
      recipients: p.recipients.map((r) => ({
        user_id: Number(r.userId),
        role: r.role,
        rank: r.rank,
        amount: Number(r.amount),
        gifted_coins: Number(r.giftedCoins),
        stay_seconds: r.staySeconds,
        stay_started_at: r.stayStartedAt?.toISOString() ?? null,
      })),
    };
  }
}

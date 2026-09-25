import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LedgerService } from '../wallet/ledger.service';
import { RoomEvents } from './room.events';

const ADMIN_LIMIT = 5;
const FRAME_DAYS = 3;
const FRAME_WINNERS = 3;

/**
 * Map ChatAura user.level → jet LV 1–5 (server-authoritative for identical room FX).
 * Bands assume typical progression ~0–10+; adjust here if product wants different cutoffs.
 */
function jetLevelFromUserLevel(level: number | null | undefined): number {
  const n = Math.floor(Number(level ?? 1));
  if (!Number.isFinite(n) || n <= 1) return 1;
  if (n <= 3) return 2;
  if (n <= 5) return 3;
  if (n <= 7) return 4;
  return 5;
}

type RoomRow = {
  id: string;
  hostId: bigint | null;
  coHostId: bigint | null;
  ownerId: bigint;
  isPermanent: boolean;
  isPrivate?: boolean;
  settings: Prisma.JsonValue | null;
};

export type RocketListSummary = {
  rocket_progress_coins: number;
  rocket_threshold_coins: number;
  rocket_progress_percent: number;
  rocket_near_launch: boolean;
  /** True while an event is LAUNCHING or a launch just completed (Home badge / strip). */
  rocket_launching: boolean;
};

const NEAR_LAUNCH_RATIO = 0.7;
/** Keep Home rocket badge visible briefly after LAUNCHED so PiP launch still shows on the card. */
const LAUNCHED_BADGE_MS = 90_000;

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
    const event = await this.getOrCreatePendingEvent(room, actorId);
    return this.serializeState(room, admins, actorId, Boolean(member), event);
  }

  /**
   * Batch rocket progress for public room lists.
   * Private rooms and inactive campaigns resolve to zeros / near_launch=false.
   */
  async summariesForRooms(
    rooms: Array<{
      id: string;
      isPermanent: boolean;
      isPrivate?: boolean;
      settings?: Prisma.JsonValue | null;
    }>,
  ): Promise<Map<string, RocketListSummary>> {
    const empty: RocketListSummary = {
      rocket_progress_coins: 0,
      rocket_threshold_coins: 0,
      rocket_progress_percent: 0,
      rocket_near_launch: false,
      rocket_launching: false,
    };
    const out = new Map<string, RocketListSummary>();
    if (rooms.length === 0) return out;

    const config = await this.activeConfig();
    if (!config) {
      for (const r of rooms) out.set(r.id, empty);
      return out;
    }

    const threshold = config.launchThresholdCoins;
    const eligibleIds: string[] = [];
    for (const r of rooms) {
      if (r.isPrivate === true) {
        out.set(r.id, empty);
        continue;
      }
      if (
        !this.roomEligible(
          {
            id: r.id,
            hostId: null,
            coHostId: null,
            ownerId: BigInt(0),
            isPermanent: r.isPermanent,
            isPrivate: r.isPrivate,
            settings: r.settings ?? null,
          },
          config.eligibleRoomTypes,
        )
      ) {
        out.set(r.id, empty);
        continue;
      }
      eligibleIds.push(r.id);
    }

    if (eligibleIds.length === 0) return out;

    const launchedAfter = new Date(Date.now() - LAUNCHED_BADGE_MS);
    const events = await this.prisma.rocketEvent.findMany({
      where: {
        roomId: { in: eligibleIds },
        OR: [
          { status: 'PENDING', expiresAt: { gt: new Date() } },
          { status: 'LAUNCHING' },
          { status: 'LAUNCHED', updatedAt: { gte: launchedAfter } },
        ],
      },
      select: {
        roomId: true,
        accumulatedCoins: true,
        status: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
    // Prefer the most recent active event per room.
    const byRoom = new Map<string, (typeof events)[number]>();
    for (const e of events) {
      if (!byRoom.has(e.roomId)) byRoom.set(e.roomId, e);
    }

    for (const id of eligibleIds) {
      const ev = byRoom.get(id);
      if (!ev) {
        out.set(id, empty);
        continue;
      }
      const launching =
        ev.status === 'LAUNCHING' ||
        (ev.status === 'LAUNCHED' && ev.updatedAt.getTime() >= launchedAfter.getTime());
      const coins = ev.accumulatedCoins ?? 0;
      const percent = launching
        ? 100
        : threshold > 0
          ? Math.min(100, Math.floor((coins / threshold) * 100))
          : 0;
      out.set(id, {
        rocket_progress_coins: coins,
        rocket_threshold_coins: threshold,
        rocket_progress_percent: percent,
        rocket_near_launch:
          launching ||
          (ev.status === 'PENDING' &&
            threshold > 0 &&
            coins / threshold >= NEAR_LAUNCH_RATIO),
        rocket_launching: launching,
      });
    }
    return out;
  }

  async addAdmin(actorId: bigint, roomKey: string, targetId: bigint) {
    const room = await this.findRoom(roomKey);
    this.assertManager(room, actorId);
    if (targetId === room.hostId || targetId === room.coHostId || targetId === room.ownerId) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Host and co-host can already manage the rocket',
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

  /**
   * Legacy endpoint — crowdfund auto-launches. Kept for clients; returns guidance.
   */
  async launch(_actorId: bigint, _roomKey: string) {
    throw new BadRequestException({
      success: false,
      error: {
        code: 'ROCKET_CROWDFUND',
        message:
          'Rocket launches automatically when the coin threshold is met. Contribute gifts or coins instead.',
      },
    });
  }

  /** Direct coin contribution into the pending Rockit event. */
  async contribute(
    actorId: bigint,
    roomKey: string,
    coins: number,
    idempotencyKey: string,
  ) {
    const amount = Math.floor(Number(coins));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'coins must be a positive integer' },
      });
    }
    const txId = (idempotencyKey || '').trim() || `direct_${actorId}_${randomUUID()}`;
    const room = await this.findRoom(roomKey);
    await this.requireActiveMember(room.id, actorId);

    const result = await this.applyContribution({
      room,
      userId: actorId,
      coins: amount,
      source: 'DIRECT',
      txId,
      debitWallet: true,
    });

    const user = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { walletBalance: true },
    });
    const state = await this.state(actorId, room.id);
    return {
      ...state,
      contribution: result.contribution,
      launched: result.launched,
      launch: result.launchPayload,
      sender_balance_after:
        user?.walletBalance == null ? null : Number(user.walletBalance),
    };
  }

  /**
   * Hook from room gift send — credits gift coin cost into pending event (idempotent by gift ref).
   * Returns progress snapshot (or null if no active campaign / ineligible).
   */
  async applyGiftContribution(
    roomId: string,
    userId: bigint,
    coins: number,
    giftTxId: string,
  ): Promise<Record<string, unknown> | null> {
    if (coins <= 0 || !giftTxId) return null;
    try {
      const room = await this.findRoom(roomId);
      const result = await this.applyContribution({
        room,
        userId,
        coins,
        source: 'GIFT',
        txId: `gift_${giftTxId}`,
        debitWallet: false,
      });
      return {
        event: result.eventSnapshot,
        launched: result.launched,
        launch_id: result.launchPayload?.launch_id ?? null,
      };
    } catch (e) {
      // Soft-fail: gift already succeeded; Rockit must not roll back gifts.
      if (
        (e as { status?: number }).status === 400 ||
        (e as BadRequestException).getStatus?.() === 400
      ) {
        return null;
      }
      console.warn('[Rocket] gift contribution skipped', (e as Error).message);
      return null;
    }
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

  // ─── Admin campaign CRUD ───────────────────────────────────────────

  async listCampaigns() {
    const rows = await this.prisma.rocketCampaignConfig.findMany({
      orderBy: [{ status: 'desc' }, { id: 'desc' }],
    });
    return { campaigns: rows.map((r) => this.serializeCampaign(r)) };
  }

  async upsertCampaign(body: {
    id?: number | string;
    name?: string;
    launch_threshold_coins: number;
    reward_pool_percentage?: number;
    max_winners_count?: number;
    reward_distribution_rules?: number[];
    minimum_contribution_required?: number;
    eligible_room_types?: string[];
    rockit_duration_seconds?: number;
    status?: boolean;
  }) {
    const threshold = Math.floor(Number(body.launch_threshold_coins));
    if (!Number.isFinite(threshold) || threshold < 1) {
      throw new BadRequestException({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'launch_threshold_coins required' },
      });
    }
    const rules = Array.isArray(body.reward_distribution_rules)
      ? body.reward_distribution_rules.map((n) => Number(n)).filter((n) => n > 0)
      : [40, 25, 15, 10, 5, 3, 2];
    const data = {
      name: (body.name || 'Rockit').slice(0, 128),
      launchThresholdCoins: threshold,
      rewardPoolPercentage: Number(body.reward_pool_percentage ?? 50),
      maxWinnersCount: Math.max(1, Math.floor(Number(body.max_winners_count ?? 7))),
      rewardDistributionRules: rules,
      minimumContributionRequired: Math.max(
        1,
        Math.floor(Number(body.minimum_contribution_required ?? 1)),
      ),
      eligibleRoomTypes: Array.isArray(body.eligible_room_types)
        ? body.eligible_room_types
        : ['all'],
      rockitDurationSeconds: Math.max(
        60,
        Math.floor(Number(body.rockit_duration_seconds ?? 3600)),
      ),
      status: body.status !== false,
    };

    const id = body.id != null ? BigInt(body.id) : null;
    const row = id
      ? await this.prisma.rocketCampaignConfig.update({ where: { id }, data })
      : await this.prisma.rocketCampaignConfig.create({ data });

    // Only one active campaign at a time when activating
    if (row.status) {
      await this.prisma.rocketCampaignConfig.updateMany({
        where: { id: { not: row.id }, status: true },
        data: { status: false },
      });
    }
    return { campaign: this.serializeCampaign(row) };
  }

  async deleteCampaign(id: bigint) {
    await this.prisma.rocketCampaignConfig.delete({ where: { id } });
    return { deleted: true };
  }

  // ─── Core crowdfund logic ──────────────────────────────────────────

  private async applyContribution(args: {
    room: RoomRow;
    userId: bigint;
    coins: number;
    source: 'GIFT' | 'DIRECT';
    txId: string;
    debitWallet: boolean;
  }): Promise<{
    contribution: { coins: number; source: string; tx_id: string };
    eventSnapshot: Record<string, unknown> | null;
    launched: boolean;
    launchPayload: Record<string, unknown> | null;
  }> {
    const existing = await this.prisma.rocketContribution.findUnique({
      where: { txId: args.txId },
    });
    if (existing) {
      const event = await this.prisma.rocketEvent.findUnique({
        where: { id: existing.eventId },
        include: { config: true },
      });
      return {
        contribution: {
          coins: existing.coins,
          source: existing.source,
          tx_id: existing.txId,
        },
        eventSnapshot: event ? this.eventSnapshot(event, event.config, args.userId) : null,
        launched: event?.status === 'LAUNCHED',
        launchPayload: event?.launchId
          ? await this.launchPayload(event.launchId, null)
          : null,
      };
    }

    const config = await this.activeConfig();
    if (!config || !config.status) {
      throw new BadRequestException({
        success: false,
        error: { code: 'ROCKET_INACTIVE', message: 'No active Rockit campaign' },
      });
    }
    if (!this.roomEligible(args.room, config.eligibleRoomTypes)) {
      throw new BadRequestException({
        success: false,
        error: { code: 'ROCKET_INELIGIBLE', message: 'This room type is not eligible for Rockit' },
      });
    }
    if (args.coins < config.minimumContributionRequired) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Minimum contribution is ${config.minimumContributionRequired} coins`,
        },
      });
    }

    let launchPayload: Record<string, unknown> | null = null;
    let launched = false;
    let eventSnapshot: Record<string, unknown> | null = null;

    try {
    await this.prisma.$transaction(
      async (tx) => {
        if (args.debitWallet) {
          const locked = await this.ledger.lockUsers(tx, [args.userId]);
          const user = locked.get(args.userId.toString());
          if (!user) {
            throw Object.assign(new Error('USER_NOT_FOUND'), { code: 'USER_NOT_FOUND' });
          }
          await this.ledger.debitCoins(
            tx,
            args.userId,
            args.coins,
            'ROCKET_CONTRIBUTE',
            'Rockit contribution',
            args.txId,
            user,
            {
              source: 'rocket',
              currency: 'coins',
              room_id: args.room.id,
            },
            'rocket',
          );
        }

        let event = await tx.rocketEvent.findFirst({
          where: { roomId: args.room.id, status: 'PENDING' },
          orderBy: { createdAt: 'desc' },
        });

        if (event && event.expiresAt.getTime() <= Date.now()) {
          await tx.rocketEvent.update({
            where: { id: event.id },
            data: { status: 'EXPIRED' },
          });
          event = null;
        }

        if (!event) {
          event = await tx.rocketEvent.create({
            data: {
              id: randomUUID(),
              roomId: args.room.id,
              configId: config.id,
              accumulatedCoins: 0,
              status: 'PENDING',
              expiresAt: new Date(Date.now() + config.rockitDurationSeconds * 1000),
            },
          });
        }

        // Row lock via version bump
        const locked = await tx.$queryRaw<
          Array<{
            id: string;
            accumulated_coins: number;
            status: string;
            version: number;
            config_id: bigint;
          }>
        >`
          SELECT id, accumulated_coins, status, version, config_id
          FROM rocket_events
          WHERE id = ${event.id}::uuid
          FOR UPDATE
        `;
        const row = locked[0];
        if (!row || row.status !== 'PENDING') {
          throw new BadRequestException({
            success: false,
            error: {
              code: 'ROCKET_CLOSED',
              message: 'Rockit event is no longer accepting contributions',
            },
          });
        }

        await tx.rocketContribution.create({
          data: {
            eventId: event.id,
            userId: args.userId,
            coins: args.coins,
            source: args.source,
            txId: args.txId,
          },
        });

        const nextAccum = row.accumulated_coins + args.coins;
        await tx.rocketEvent.update({
          where: { id: event.id },
          data: {
            accumulatedCoins: nextAccum,
            version: { increment: 1 },
          },
        });

        eventSnapshot = {
          status: 'PENDING',
          current_coins: nextAccum,
          threshold: config.launchThresholdCoins,
          expires_at: event.expiresAt.toISOString(),
        };

        if (nextAccum >= config.launchThresholdCoins) {
          // Claim launch exactly once
          const claim = await tx.rocketEvent.updateMany({
            where: { id: event.id, status: 'PENDING' },
            data: { status: 'LAUNCHING' },
          });
          if (claim.count === 1) {
            launchPayload = await this.executeLaunchFromEvent(
              tx,
              args.room,
              event.id,
              config,
              nextAccum,
            );
            launched = true;
            eventSnapshot = {
              status: 'LAUNCHED',
              current_coins: nextAccum,
              threshold: config.launchThresholdCoins,
              launch_id: launchPayload?.launch_id ?? null,
            };
          }
        }
      },
      { timeout: 25_000 },
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

    if (launched && launchPayload) {
      this.events.emitRocketLaunch(args.room.id, launchPayload);
    }

    return {
      contribution: { coins: args.coins, source: args.source, tx_id: args.txId },
      eventSnapshot,
      launched,
      launchPayload,
    };
  }

  private async executeLaunchFromEvent(
    tx: Prisma.TransactionClient,
    room: RoomRow,
    eventId: string,
    config: {
      id: bigint;
      launchThresholdCoins: number;
      rewardPoolPercentage: number;
      maxWinnersCount: number;
      rewardDistributionRules: Prisma.JsonValue;
    },
    accumulated: number,
    launcherId?: bigint,
  ): Promise<Record<string, unknown>> {
    const launchId = randomUUID();
    const pool = Math.floor(
      (accumulated * Number(config.rewardPoolPercentage)) / 100,
    );

    const aggregatesRaw = await tx.rocketContribution.groupBy({
      by: ['userId'],
      where: { eventId },
      _sum: { coins: true },
    });
    const aggregates = [...aggregatesRaw].sort(
      (a, b) => (b._sum.coins ?? 0) - (a._sum.coins ?? 0),
    );

    const rules = this.parseRules(config.rewardDistributionRules, config.maxWinnersCount);
    const winners = aggregates.slice(0, Math.min(rules.length, config.maxWinnersCount));
    const coinShares = this.splitByPercent(pool, rules.slice(0, winners.length));

    const frames = await tx.frame.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
      take: FRAME_WINNERS,
    });

    const launcher =
      launcherId ??
      room.hostId ??
      room.ownerId;

    const topContributorId = winners[0]?.userId ?? launcher;
    const topUser = await tx.user.findUnique({
      where: { id: topContributorId },
      select: {
        id: true,
        displayName: true,
        name: true,
        avatarUrl: true,
        level: true,
      },
    });
    const jetLevel = jetLevelFromUserLevel(topUser?.level);

    const expires = new Date(Date.now() + FRAME_DAYS * 24 * 60 * 60 * 1000);
    for (let i = 0; i < winners.length; i++) {
      const userId = winners[i].userId;
      const coins = coinShares[i] ?? 0;
      const xp = Math.max(20, Math.round(coins * 0.02));
      if (coins > 0) {
        await this.ledger.creditCoins(
          tx,
          userId,
          coins,
          'ROCKET_REWARD',
          'Rockit reward',
          `rocket_reward_${launchId}_${userId}`,
          null,
          {
            source: 'rocket',
            currency: 'coins',
            room_id: room.id,
            launch_id: launchId,
            rank: i + 1,
          },
        );
      }
      if (xp > 0) {
        await tx.user.update({
          where: { id: userId },
          data: { xp: { increment: xp }, exp: { increment: xp } },
        });
      }
      const frame = i < frames.length ? frames[i] : null;
      if (frame) {
        await tx.userUnlockedFrame.upsert({
          where: { userId_frameId: { userId, frameId: frame.id } },
          create: {
            userId,
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
        launcherId: launcher,
        price: accumulated,
        coinPool: pool,
        joinedCount: aggregates.length,
        winnerCount: winners.length,
        jetLevel,
        topContributorId,
        rewards: {
          create: winners.map((w, i) => ({
            userId: w.userId,
            coins: coinShares[i] ?? 0,
            xp: Math.max(20, Math.round((coinShares[i] ?? 0) * 0.02)),
            frameId: i < frames.length ? frames[i].id : null,
            frameName: i < frames.length ? frames[i].name : null,
            frameDays: i < frames.length ? FRAME_DAYS : null,
          })),
        },
      },
    });

    await tx.rocketEvent.update({
      where: { id: eventId },
      data: { status: 'LAUNCHED', launchId },
    });

    // Build payload without leaving transaction (users for names)
    const userIds = winners.map((w) => w.userId);
    const users = await tx.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, displayName: true, name: true, avatarUrl: true, level: true },
    });
    const byId = new Map(users.map((u) => [u.id.toString(), u]));
    const launcherUser = await tx.user.findUnique({
      where: { id: launcher },
      select: { id: true, displayName: true, name: true, avatarUrl: true },
    });

    return {
      launch_id: launchId,
      price: accumulated,
      coin_pool: pool,
      joined_count: aggregates.length,
      winner_count: winners.length,
      jet_level: jetLevel,
      sender_balance_after: null,
      launcher: {
        id: Number(launcher),
        name: launcherUser?.displayName || launcherUser?.name || 'Host',
        avatar_url: launcherUser?.avatarUrl ?? null,
      },
      top_contributor: {
        id: Number(topContributorId),
        name: topUser?.displayName || topUser?.name || 'User',
        avatar_url: topUser?.avatarUrl ?? null,
        level: topUser?.level ?? 1,
      },
      rewards: winners.map((w, i) => {
        const u = byId.get(w.userId.toString());
        return {
          user_id: Number(w.userId),
          name: u?.displayName || u?.name || 'User',
          avatar_url: u?.avatarUrl ?? null,
          coins: coinShares[i] ?? 0,
          xp: Math.max(20, Math.round((coinShares[i] ?? 0) * 0.02)),
          frame_id: i < frames.length ? Number(frames[i].id) : null,
          frame_name: i < frames.length ? frames[i].name : null,
          frame_days: i < frames.length ? FRAME_DAYS : null,
        };
      }),
    };
  }

  private async launchPayload(launchId: string, senderBalance: bigint | null) {
    const launch = await this.prisma.rocketLaunch.findUniqueOrThrow({
      where: { id: launchId },
      include: {
        launcher: { select: { id: true, displayName: true, name: true, avatarUrl: true } },
        rewards: {
          include: {
            user: { select: { id: true, displayName: true, name: true, avatarUrl: true, level: true } },
          },
        },
      },
    });
    const rewards = [...launch.rewards].sort((a, b) => b.coins - a.coins);
    const top =
      launch.topContributorId != null
        ? rewards.find((r) => r.userId === launch.topContributorId) ?? rewards[0]
        : rewards[0];
    const topUser = top?.user;
    return {
      launch_id: launch.id,
      price: launch.price,
      coin_pool: launch.coinPool,
      joined_count: launch.joinedCount,
      winner_count: launch.winnerCount,
      jet_level: launch.jetLevel,
      sender_balance_after: senderBalance == null ? null : Number(senderBalance),
      launcher: {
        id: Number(launch.launcher.id),
        name: launch.launcher.displayName || launch.launcher.name || 'Host',
        avatar_url: launch.launcher.avatarUrl,
      },
      top_contributor: topUser
        ? {
            id: Number(top.userId),
            name: topUser.displayName || topUser.name || 'User',
            avatar_url: topUser.avatarUrl,
            level: topUser.level ?? 1,
          }
        : null,
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

  private async getOrCreatePendingEvent(room: RoomRow, actorId: bigint) {
    const config = await this.activeConfig();
    if (!config || !this.roomEligible(room, config.eligibleRoomTypes)) {
      return null;
    }

    await this.prisma.rocketEvent.updateMany({
      where: {
        roomId: room.id,
        status: 'PENDING',
        expiresAt: { lte: new Date() },
      },
      data: { status: 'EXPIRED' },
    });

    let event = await this.prisma.rocketEvent.findFirst({
      where: { roomId: room.id, status: 'PENDING' },
      include: { config: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!event) {
      event = await this.prisma.rocketEvent.create({
        data: {
          id: randomUUID(),
          roomId: room.id,
          configId: config.id,
          accumulatedCoins: 0,
          status: 'PENDING',
          expiresAt: new Date(Date.now() + config.rockitDurationSeconds * 1000),
        },
        include: { config: true },
      });
    }

    const my = await this.prisma.rocketContribution.aggregate({
      where: { eventId: event.id, userId: actorId },
      _sum: { coins: true },
    });
    const topRaw = await this.prisma.rocketContribution.groupBy({
      by: ['userId'],
      where: { eventId: event.id },
      _sum: { coins: true },
    });
    const top = [...topRaw]
      .sort((a, b) => (b._sum.coins ?? 0) - (a._sum.coins ?? 0))
      .slice(0, 5);
    const userIds = top.map((t) => t.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, displayName: true, name: true, avatarUrl: true },
    });
    const byId = new Map(users.map((u) => [u.id.toString(), u]));

    return {
      status: event.status,
      current_coins: event.accumulatedCoins,
      threshold: event.config.launchThresholdCoins,
      expires_at: event.expiresAt.toISOString(),
      my_contribution: my._sum.coins ?? 0,
      minimum_contribution: event.config.minimumContributionRequired,
      top_contributors: top.map((t) => {
        const u = byId.get(t.userId.toString());
        return {
          id: Number(t.userId),
          name: u?.displayName || u?.name || 'User',
          avatar_url: u?.avatarUrl ?? null,
          coins: t._sum.coins ?? 0,
        };
      }),
    };
  }

  private eventSnapshot(
    event: { status: string; accumulatedCoins: number; expiresAt: Date; launchId: string | null },
    config: { launchThresholdCoins: number },
    _userId: bigint,
  ) {
    return {
      status: event.status,
      current_coins: event.accumulatedCoins,
      threshold: config.launchThresholdCoins,
      expires_at: event.expiresAt.toISOString(),
      launch_id: event.launchId,
    };
  }

  private async serializeState(
    room: RoomRow,
    admins: Array<{
      userId: bigint;
      user: { displayName: string | null; name: string | null; avatarUrl: string | null };
    }>,
    actorId: bigint,
    joined: boolean,
    event: Record<string, unknown> | null,
  ) {
    const manager = this.isManager(room, actorId);
    const isAdmin = admins.some((a) => a.userId === actorId);
    const config = await this.activeConfig();
    return {
      price: config?.launchThresholdCoins ?? 100_000,
      coin_pool_ratio: (config?.rewardPoolPercentage ?? 50) / 100,
      admin_limit: ADMIN_LIMIT,
      can_manage: manager,
      can_launch: false,
      can_contribute: joined && Boolean(event),
      mode: 'crowdfund',
      event,
      admins: admins.map((a) => ({
        id: Number(a.userId),
        name: a.user.displayName || a.user.name || 'User',
        avatar_url: a.user.avatarUrl,
      })),
    };
  }

  private serializeCampaign(row: {
    id: bigint;
    name: string;
    launchThresholdCoins: number;
    rewardPoolPercentage: number;
    maxWinnersCount: number;
    rewardDistributionRules: Prisma.JsonValue;
    minimumContributionRequired: number;
    eligibleRoomTypes: Prisma.JsonValue;
    rockitDurationSeconds: number;
    status: boolean;
  }) {
    return {
      id: Number(row.id),
      name: row.name,
      launch_threshold_coins: row.launchThresholdCoins,
      reward_pool_percentage: row.rewardPoolPercentage,
      max_winners_count: row.maxWinnersCount,
      reward_distribution_rules: row.rewardDistributionRules,
      minimum_contribution_required: row.minimumContributionRequired,
      eligible_room_types: row.eligibleRoomTypes,
      rockit_duration_seconds: row.rockitDurationSeconds,
      status: row.status,
    };
  }

  private async activeConfig() {
    return this.prisma.rocketCampaignConfig.findFirst({
      where: { status: true },
      orderBy: { id: 'desc' },
    });
  }

  private roomEligible(room: RoomRow, typesJson: Prisma.JsonValue): boolean {
    const types = Array.isArray(typesJson)
      ? (typesJson as unknown[]).map(String)
      : ['all'];
    if (types.includes('all')) return true;
    const tags: string[] = [];
    const isPrivate =
      room.isPrivate === true ||
      (room.settings as { private?: boolean } | null)?.private === true;
    if (isPrivate) {
      tags.push('private');
      return types.includes('private');
    }
    if (room.isPermanent) tags.push('vip', 'permanent');
    else tags.push('public');
    return types.some((t) => tags.includes(t));
  }

  private parseRules(json: Prisma.JsonValue, max: number): number[] {
    const arr = Array.isArray(json) ? (json as unknown[]).map(Number).filter((n) => n > 0) : [];
    if (arr.length === 0) return Array.from({ length: Math.min(7, max) }, (_, i) => (i === 0 ? 40 : 10));
    return arr.slice(0, max);
  }

  private splitByPercent(pool: number, percents: number[]): number[] {
    if (percents.length === 0 || pool <= 0) return [];
    const sum = percents.reduce((a, b) => a + b, 0) || 1;
    const shares = percents.map((p) => Math.floor((pool * p) / sum));
    const used = shares.reduce((a, b) => a + b, 0);
    if (shares.length > 0 && used < pool) shares[0] += pool - used;
    return shares;
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

  private isManager(room: RoomRow, userId: bigint) {
    return userId === room.hostId || userId === room.coHostId || userId === room.ownerId;
  }

  private assertManager(room: RoomRow, userId: bigint) {
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

  private async requireActiveMember(roomId: string, userId: bigint) {
    const member = await this.prisma.roomMember.findFirst({
      where: { roomId, userId, isActive: true },
    });
    if (!member) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'NOT_IN_ROOM', message: 'Join the room before contributing' },
      });
    }
  }

  private async findRoom(id: string): Promise<RoomRow> {
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

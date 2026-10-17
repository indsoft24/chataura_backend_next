import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma, RocketEvent } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LedgerService } from '../wallet/ledger.service';
import { RoomEvents } from './room.events';
import {
  activeLadder,
  ALL_TIME_CYCLE,
  assetKeyFor,
  AssetSlot,
  CampaignRow,
  clampInt,
  cycleKeyAt,
  DEFAULT_LADDER,
  eventExpiry,
  LevelInput,
  LevelRow,
  ladderStatus,
  levelAtOrAbove,
  nextLevelAfter,
  nextResetAt,
  parseRules,
  pickLuckyWinners,
  rankPresentContributors,
  resolveLevel,
  RocketLevelSnapshot,
  safeTimeZone,
  snapshotOf,
  splitByPercent,
  splitContribution,
  splitLucky,
  unlockedTopLevel,
  validateLevels,
} from './rocket-levels';
import { readMemberTimeoutSeconds } from './room-state/room-runtime.config';

const ADMIN_LIMIT = 5;
const LEVEL_SWITCH_COOLDOWN_MS = 10_000;

type ActiveConfig = Prisma.RocketCampaignConfigGetPayload<{ include: { levels: true } }>;

/** JSON-safe copy for audit snapshots (BigInt → number, Date → ISO). */
function toJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)));
}

/**
 * Legacy campaigns (no ladder levels): map ChatAura user.level → jet LV 1–5.
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
  /** Current ladder level (0 = legacy single-threshold campaign). */
  rocket_level: number;
  rocket_level_name: string | null;
  rocket_theme_color: string | null;
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
    const config = await this.activeConfig();
    const event =
      config && this.roomEligible(room, config.eligibleRoomTypes)
        ? await this.prisma.$transaction((tx) => this.ensurePendingEvent(tx, room, config))
        : null;
    return this.serializeState(room, admins, actorId, Boolean(member), config, event);
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
      rocket_level: 0,
      rocket_level_name: null,
      rocket_theme_color: null,
    };
    const out = new Map<string, RocketListSummary>();
    if (rooms.length === 0) return out;

    const config = await this.activeConfig();
    if (!config) {
      for (const r of rooms) out.set(r.id, empty);
      return out;
    }

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

    const now = new Date();
    const launchedAfter = new Date(now.getTime() - LAUNCHED_BADGE_MS);
    const events = await this.prisma.rocketEvent.findMany({
      where: {
        roomId: { in: eligibleIds },
        OR: [
          { status: 'PENDING', expiresAt: { gt: now } },
          { status: 'LAUNCHING' },
          { status: 'LAUNCHED', updatedAt: { gte: launchedAfter } },
        ],
      },
      select: {
        roomId: true,
        accumulatedCoins: true,
        status: true,
        level: true,
        configSnapshot: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
    // A launch leaves a recent LAUNCHED row plus the next level's PENDING row: badge shows
    // "launching" for the former, progress comes from the latter.
    const pendingByRoom = new Map<string, (typeof events)[number]>();
    const launchingByRoom = new Map<string, (typeof events)[number]>();
    for (const e of events) {
      if (e.status === 'PENDING') {
        if (!pendingByRoom.has(e.roomId)) pendingByRoom.set(e.roomId, e);
      } else if (!launchingByRoom.has(e.roomId)) {
        launchingByRoom.set(e.roomId, e);
      }
    }

    for (const id of eligibleIds) {
      const launchEv = launchingByRoom.get(id);
      const ev = launchEv ?? pendingByRoom.get(id);
      if (!ev) {
        out.set(id, empty);
        continue;
      }
      const snap = this.snapshotFromEvent(ev, config);
      const threshold = snap.threshold;
      const launching = Boolean(launchEv);
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
          launching || (threshold > 0 && coins / threshold >= NEAR_LAUNCH_RATIO),
        rocket_launching: launching,
        rocket_level: snap.legacy_jet ? 0 : snap.level,
        rocket_level_name: snap.legacy_jet ? null : snap.name,
        rocket_theme_color: snap.legacy_jet ? null : snap.theme_color,
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

  // shortcut: per-process cooldown map; move to Redis if the API runs on more than one instance.
  private readonly levelSwitchAt = new Map<string, number>();

  /**
   * Host / owner / co-host switches the room rocket to an unlocked level. The current level's
   * progress is paused (kept) and resumes when the room switches back.
   */
  async selectLevel(actorId: bigint, roomKey: string, level: number) {
    const room = await this.findRoom(roomKey);
    if (!this.isManager(room, actorId)) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only the host, owner or co-host can change the rocket level' },
      });
    }
    const config = await this.activeConfig();
    if (!config || !this.roomEligible(room, config.eligibleRoomTypes) || this.isLegacy(config)) {
      throw this.rocketError('ROCKET_UNAVAILABLE', 'Rocket levels are not available in this room');
    }
    const ladder = activeLadder(config, config.levels);
    const target = ladder.find((l) => l.level === Math.floor(Number(level)));
    if (!target) throw this.rocketError('VALIDATION_ERROR', 'Unknown rocket level');
    const lastSwitch = this.levelSwitchAt.get(room.id) ?? 0;
    if (Date.now() - lastSwitch < LEVEL_SWITCH_COOLDOWN_MS) {
      throw this.rocketError('TOO_FAST', 'Please wait a few seconds before switching again');
    }

    await this.prisma.$transaction(async (tx) => {
      // Holds the per-room rocket lock, so no contribution or launch runs in between.
      const pending = await this.ensurePendingEvent(tx, room, config);
      if (pending.level === target.level) return;
      const cycleKey = pending.cycleKey ?? cycleKeyAt(new Date(), config);
      const top = unlockedTopLevel(ladder, await this.highestLaunchedLevel(tx, room.id, cycleKey));
      if (target.level > top) {
        throw this.rocketError('LEVEL_LOCKED', `LV${target.level} is locked. Launch LV${top} to unlock the next level.`);
      }
      const paused = await tx.rocketEvent.updateMany({
        where: { id: pending.id, status: 'PENDING' },
        data: { status: 'PAUSED', version: { increment: 1 } },
      });
      if (paused.count !== 1) throw this.rocketError('ROCKET_BUSY', 'The rocket just changed. Try again.');
      await this.openLevelEvent(tx, room.id, config, target, cycleKey, 0);
    });
    this.levelSwitchAt.set(room.id, Date.now());
    return this.state(actorId, room.id);
  }

  private rocketError(code: string, message: string) {
    return new BadRequestException({ success: false, error: { code, message } });
  }

  /** Highest level this room ever launched (this cycle when daily reset is on); pre-ladder rows ignored. */
  private async highestLaunchedLevel(
    tx: Prisma.TransactionClient,
    roomId: string,
    cycleKey: string,
  ): Promise<number | null> {
    const r = await tx.rocketEvent.aggregate({
      where: {
        roomId,
        status: 'LAUNCHED',
        cycleKey: cycleKey === ALL_TIME_CYCLE ? { not: null } : cycleKey,
      },
      _max: { level: true },
    });
    return r._max.level ?? null;
  }

  /**
   * Makes [level] the room's PENDING event: resumes its paused event (adding [initialCoins],
   * capped below the threshold so one contribution never launches twice) or creates a new one.
   * Returns the event and the coins actually added.
   */
  private async openLevelEvent(
    tx: Prisma.TransactionClient,
    roomId: string,
    config: ActiveConfig,
    level: LevelRow,
    cycleKey: string,
    initialCoins: number,
  ): Promise<{ event: RocketEvent; added: number }> {
    const paused = await tx.rocketEvent.findFirst({
      where: { roomId, status: 'PAUSED', level: level.level, cycleKey },
      orderBy: { createdAt: 'desc' },
    });
    if (paused) {
      const threshold = this.snapshotFromEvent(paused, config).threshold;
      const added = Math.max(0, Math.min(initialCoins, threshold - 1 - paused.accumulatedCoins));
      const event = await tx.rocketEvent.update({
        where: { id: paused.id },
        data: { status: 'PENDING', accumulatedCoins: { increment: added }, version: { increment: 1 } },
      });
      return { event, added };
    }
    const event = await this.createEvent(tx, roomId, config, level, this.isLegacy(config), cycleKey, initialCoins);
    return { event, added: initialCoins };
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
      include: { levels: { orderBy: { level: 'asc' } } },
    });
    // Current GCS URL per asset key so the admin can preview each level's media.
    const keys = rows.flatMap((r) =>
      r.levels.flatMap((l) => [
        l.launchAssetKey,
        l.stationAssetKey,
        l.badgeAssetKey,
        assetKeyFor('launch', l.level),
        assetKeyFor('station', l.level),
        assetKeyFor('badge', l.level),
        assetKeyFor('launch', l.visualTier),
      ]),
    );
    const urls = await this.assetUrls([...keys, 'rocket.station_idle']);
    return {
      campaigns: rows.map((r) => this.serializeCampaign(r)),
      asset_urls: Object.fromEntries(urls),
    };
  }

  async upsertCampaign(
    body: {
      id?: number | string;
      name?: string;
      launch_threshold_coins?: number;
      reward_pool_percentage?: number;
      max_winners_count?: number;
      reward_distribution_rules?: number[];
      minimum_contribution_required?: number;
      eligible_room_types?: string[];
      rockit_duration_seconds?: number;
      status?: boolean;
      daily_reset_enabled?: boolean;
      reset_timezone?: string;
      reset_hour?: number;
      expiry_mode?: string;
      carry_overflow?: boolean;
    },
    actorId?: bigint,
  ) {
    const id = body.id != null ? BigInt(body.id) : null;
    const before = id
      ? await this.prisma.rocketCampaignConfig.findUnique({
          where: { id },
          include: { levels: { orderBy: { level: 'asc' } } },
        })
      : null;
    if (id && !before) {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Campaign not found' },
      });
    }

    // Legacy single-threshold field: only used when a campaign has no levels.
    const threshold = Math.floor(
      Number(body.launch_threshold_coins ?? before?.launchThresholdCoins ?? DEFAULT_LADDER[0].threshold_coins),
    );
    if (!Number.isFinite(threshold) || threshold < 1) {
      throw this.validation('launch_threshold_coins must be a positive integer');
    }
    const tz = (body.reset_timezone ?? before?.resetTimezone ?? 'Asia/Kolkata').trim();
    if (safeTimeZone(tz) !== tz) throw this.validation(`Unknown timezone: ${tz}`);
    const expiryMode = body.expiry_mode ?? before?.expiryMode ?? 'RESET_PROGRESS';
    if (expiryMode !== 'RESET_PROGRESS' && expiryMode !== 'RESET_CYCLE') {
      throw this.validation('expiry_mode must be RESET_PROGRESS or RESET_CYCLE');
    }
    const rules = Array.isArray(body.reward_distribution_rules)
      ? body.reward_distribution_rules.map((n) => Number(n)).filter((n) => n > 0)
      : ((before?.rewardDistributionRules as number[] | undefined) ?? [40, 25, 15, 10, 5, 3, 2]);
    const data = {
      name: (body.name ?? before?.name ?? 'Rockit').slice(0, 128),
      launchThresholdCoins: threshold,
      rewardPoolPercentage: Number(body.reward_pool_percentage ?? before?.rewardPoolPercentage ?? 15),
      maxWinnersCount: Math.max(1, Math.floor(Number(body.max_winners_count ?? before?.maxWinnersCount ?? 7))),
      rewardDistributionRules: rules,
      minimumContributionRequired: Math.max(
        1,
        Math.floor(Number(body.minimum_contribution_required ?? before?.minimumContributionRequired ?? 1)),
      ),
      eligibleRoomTypes: Array.isArray(body.eligible_room_types)
        ? body.eligible_room_types
        : ((before?.eligibleRoomTypes as string[] | undefined) ?? ['all']),
      rockitDurationSeconds: Math.max(
        60,
        Math.floor(Number(body.rockit_duration_seconds ?? before?.rockitDurationSeconds ?? 3600)),
      ),
      status: body.status ?? before?.status ?? true,
      dailyResetEnabled: body.daily_reset_enabled ?? before?.dailyResetEnabled ?? true,
      resetTimezone: tz,
      resetHour: clampInt(body.reset_hour ?? before?.resetHour ?? 4, 0, 23),
      expiryMode,
      carryOverflow: body.carry_overflow ?? before?.carryOverflow ?? true,
    };

    const row = await this.prisma.$transaction(async (tx) => {
      const saved = id
        ? await tx.rocketCampaignConfig.update({ where: { id }, data })
        : await tx.rocketCampaignConfig.create({ data });
      if (!id) {
        // New campaigns start with the standard LV1–LV5 ladder and its rocket frames.
        const frames = await tx.frame.findMany({
          where: { slug: { in: DEFAULT_LADDER.map((l) => l.frame_slug ?? '') }, isActive: true },
          select: { id: true, slug: true },
        });
        const frameBySlug = new Map(frames.map((f) => [f.slug, Number(f.id)]));
        await tx.rocketLevelConfig.createMany({
          data: DEFAULT_LADDER.map((l) =>
            this.levelData(saved.id, { ...l, frame_id: frameBySlug.get(l.frame_slug ?? '') ?? null }),
          ),
        });
      }
      // Only one active campaign at a time when activating
      if (saved.status) {
        await tx.rocketCampaignConfig.updateMany({
          where: { id: { not: saved.id }, status: true },
          data: { status: false },
        });
      }
      const full = await tx.rocketCampaignConfig.findUniqueOrThrow({
        where: { id: saved.id },
        include: { levels: { orderBy: { level: 'asc' } } },
      });
      await this.audit(tx, actorId, id ? 'CAMPAIGN_UPDATE' : 'CAMPAIGN_CREATE', saved.id, before, full);
      return full;
    });
    return { campaign: this.serializeCampaign(row) };
  }

  async deleteCampaign(id: bigint, actorId?: bigint) {
    const before = await this.prisma.rocketCampaignConfig.findUnique({
      where: { id },
      include: { levels: true },
    });
    const events = await this.prisma.rocketEvent.count({ where: { configId: id } });
    if (events > 0) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'CAMPAIGN_IN_USE',
          message: 'This campaign has rocket history. Deactivate it instead of deleting.',
        },
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.rocketCampaignConfig.delete({ where: { id } });
      await this.audit(tx, actorId, 'CAMPAIGN_DELETE', id, before, null);
    });
    return { deleted: true };
  }

  /** Replace a campaign's ladder (levels 1..N). Running events keep their snapshot. */
  async saveLevels(campaignId: bigint, levels: LevelInput[], actorId?: bigint) {
    const errors = validateLevels(levels);
    if (errors.length) {
      throw new BadRequestException({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: errors[0], details: errors },
      });
    }
    const frameIds = levels.map((l) => l.frame_id).filter((f): f is number => f != null);
    if (frameIds.length) {
      const found = await this.prisma.frame.count({ where: { id: { in: frameIds.map(BigInt) } } });
      if (found !== new Set(frameIds).size) throw this.validation('One of the selected frames does not exist');
    }
    const campaign = await this.prisma.rocketCampaignConfig.findUnique({
      where: { id: campaignId },
      include: { levels: { orderBy: { level: 'asc' } } },
    });
    if (!campaign) {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Campaign not found' },
      });
    }
    const full = await this.prisma.$transaction(async (tx) => {
      const keep = levels.map((l) => l.level);
      await tx.rocketLevelConfig.deleteMany({ where: { campaignId, level: { notIn: keep } } });
      for (const l of levels) {
        const data = this.levelData(campaignId, l);
        await tx.rocketLevelConfig.upsert({
          where: { campaignId_level: { campaignId, level: l.level } },
          create: data,
          update: data,
        });
      }
      const after = await tx.rocketCampaignConfig.findUniqueOrThrow({
        where: { id: campaignId },
        include: { levels: { orderBy: { level: 'asc' } } },
      });
      const refreshed = await this.refreshPendingEvents(tx, after);
      await this.audit(tx, actorId, 'LEVELS_SAVE', campaignId, campaign, { ...after, refreshed_live_events: refreshed });
      return { after, refreshed };
    });
    return { campaign: this.serializeCampaign(full.after), refreshed_live_events: full.refreshed };
  }

  /**
   * Applies saved level settings to rockets already in progress, so a new target or reward
   * split takes effect now instead of after the daily reset. Progress is kept; a rocket whose
   * new target is already met launches on its next contribution.
   */
  private async refreshPendingEvents(tx: Prisma.TransactionClient, config: ActiveConfig): Promise<number> {
    const pending = await tx.rocketEvent.findMany({
      where: { configId: config.id, status: 'PENDING', cycleKey: { not: null } },
      select: { id: true, roomId: true, level: true },
      orderBy: { roomId: 'asc' },
    });
    if (pending.length === 0) return 0;
    const ladder = activeLadder(config, config.levels);
    const legacy = this.isLegacy(config);
    let refreshed = 0;
    for (const ev of pending) {
      // Same per-room lock as contributions, so no contribution sees a half-updated rocket.
      await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(hashtext(${`rocket:${ev.roomId}`}))) AS l`;
      const level = levelAtOrAbove(ladder, ev.level);
      const updated = await tx.rocketEvent.updateMany({
        where: { id: ev.id, status: 'PENDING' },
        data: {
          level: level.level,
          configSnapshot: snapshotOf(level, config, legacy) as unknown as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
      });
      refreshed += updated.count;
    }
    return refreshed;
  }

  /** Point a level's launch/station/badge slot at an uploaded FX asset key. */
  async attachLevelAsset(
    campaignId: bigint,
    level: number,
    slot: AssetSlot,
    assetKey: string,
    actorId?: bigint,
  ) {
    const row = await this.prisma.rocketLevelConfig.findUnique({
      where: { campaignId_level: { campaignId, level } },
    });
    if (!row) {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: `LV${level} does not exist on this campaign` },
      });
    }
    const field =
      slot === 'launch' ? 'launchAssetKey' : slot === 'station' ? 'stationAssetKey' : 'badgeAssetKey';
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.rocketLevelConfig.update({
        where: { id: row.id },
        data: { [field]: assetKey },
      });
      await this.audit(tx, actorId, `ASSET_${slot.toUpperCase()}`, campaignId, row, updated);
    });
    return this.listCampaigns();
  }

  async auditLog(campaignId?: bigint, limit = 50) {
    const rows = await this.prisma.rocketConfigAudit.findMany({
      where: campaignId ? { campaignId } : {},
      orderBy: { id: 'desc' },
      take: Math.min(200, Math.max(1, limit)),
    });
    return {
      entries: rows.map((r) => ({
        id: Number(r.id),
        actor_id: r.actorId == null ? null : Number(r.actorId),
        action: r.action,
        campaign_id: r.campaignId == null ? null : Number(r.campaignId),
        before: r.before,
        after: r.after,
        created_at: r.createdAt.toISOString(),
      })),
    };
  }

  /** Restore a campaign's settings + ladder to the "before" state of an audit entry. */
  async restoreFromAudit(auditId: bigint, actorId?: bigint) {
    const entry = await this.prisma.rocketConfigAudit.findUnique({ where: { id: auditId } });
    const before = entry?.before as
      | (Record<string, unknown> & { id: string | number; levels?: Array<Record<string, unknown>> })
      | null
      | undefined;
    if (!entry || !before || entry.campaignId == null) {
      throw this.validation('This change has no earlier version to restore');
    }
    await this.upsertCampaign(
      {
        id: Number(entry.campaignId),
        name: before.name as string,
        launch_threshold_coins: Number(before.launchThresholdCoins),
        reward_pool_percentage: Number(before.rewardPoolPercentage),
        max_winners_count: Number(before.maxWinnersCount),
        reward_distribution_rules: before.rewardDistributionRules as number[],
        minimum_contribution_required: Number(before.minimumContributionRequired),
        eligible_room_types: before.eligibleRoomTypes as string[],
        rockit_duration_seconds: Number(before.rockitDurationSeconds),
        status: before.status as boolean,
        daily_reset_enabled: before.dailyResetEnabled as boolean | undefined,
        reset_timezone: before.resetTimezone as string | undefined,
        reset_hour: before.resetHour as number | undefined,
        expiry_mode: before.expiryMode as string | undefined,
        carry_overflow: before.carryOverflow as boolean | undefined,
      },
      actorId,
    );
    const levels = (before.levels ?? []).map((l) => this.levelInputFromRow(l));
    if (levels.length) return this.saveLevels(entry.campaignId, levels, actorId);
    return this.listCampaigns();
  }

  private levelInputFromRow(l: Record<string, unknown>): LevelInput {
    return {
      level: Number(l.level),
      name: l.name as string,
      threshold_coins: Number(l.thresholdCoins),
      reward_pool_percentage: Number(l.rewardPoolPercentage),
      reward_distribution_rules: l.rewardDistributionRules as number[],
      frame_id: l.frameId == null ? null : Number(l.frameId),
      frame_winners: Number(l.frameWinners),
      frame_days: Number(l.frameDays),
      xp_rate: Number(l.xpRate),
      min_xp: Number(l.minXp),
      duration_seconds: Number(l.durationSeconds),
      theme_color: l.themeColor as string,
      visual_tier: Number(l.visualTier),
      launch_asset_key: (l.launchAssetKey as string | null) ?? null,
      station_asset_key: (l.stationAssetKey as string | null) ?? null,
      badge_asset_key: (l.badgeAssetKey as string | null) ?? null,
      lucky_audience_percent: Number(l.luckyAudiencePercent ?? 0),
      lucky_pool_percentage: Number(l.luckyPoolPercentage ?? 0),
      is_active: l.isActive !== false,
    };
  }

  private levelData(campaignId: bigint, l: LevelInput) {
    const rules = parseRules(l.reward_distribution_rules);
    return {
      campaignId,
      level: l.level,
      name: (l.name || `Level ${l.level}`).slice(0, 64),
      thresholdCoins: Math.floor(Number(l.threshold_coins)),
      rewardPoolPercentage: Number(l.reward_pool_percentage),
      maxWinnersCount: Math.max(1, rules.length),
      rewardDistributionRules: rules,
      frameId: l.frame_id == null ? null : BigInt(l.frame_id),
      frameWinners: clampInt(l.frame_winners ?? 3, 0, 50),
      frameDays: clampInt(l.frame_days ?? 3, 1, 365),
      xpRate: Math.max(0, Number(l.xp_rate ?? 0.02)),
      minXp: clampInt(l.min_xp ?? 20, 0, 1_000_000),
      durationSeconds: clampInt(l.duration_seconds ?? 0, 0, 7 * 86400),
      themeColor: l.theme_color || '#22C55E',
      visualTier: clampInt(l.visual_tier ?? Math.min(l.level, 5), 1, 5),
      launchAssetKey: l.launch_asset_key?.trim() || null,
      stationAssetKey: l.station_asset_key?.trim() || null,
      badgeAssetKey: l.badge_asset_key?.trim() || null,
      luckyAudiencePercent: Number(l.lucky_audience_percent ?? 0),
      luckyPoolPercentage: Number(l.lucky_pool_percentage ?? 0),
      isActive: l.is_active !== false,
    };
  }

  private async audit(
    tx: Prisma.TransactionClient,
    actorId: bigint | undefined,
    action: string,
    campaignId: bigint | null,
    before: unknown,
    after: unknown,
  ) {
    await tx.rocketConfigAudit.create({
      data: {
        actorId: actorId ?? null,
        action,
        campaignId,
        before: before == null ? Prisma.DbNull : (toJson(before) as Prisma.InputJsonValue),
        after: after == null ? Prisma.DbNull : (toJson(after) as Prisma.InputJsonValue),
      },
    });
  }

  private validation(message: string) {
    return new BadRequestException({
      success: false,
      error: { code: 'VALIDATION_ERROR', message },
    });
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
        eventSnapshot: event
          ? this.eventSnapshot(event, this.snapshotFromEvent(event, event.config))
          : null,
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

        // Holds the per-room rocket lock until commit, so the read below is authoritative.
        const event = await this.ensurePendingEvent(tx, args.room, config);
        const snap = this.snapshotFromEvent(event, config);
        const ladder = activeLadder(config, config.levels);
        const next = nextLevelAfter(ladder, snap.level);
        const split = splitContribution(
          event.accumulatedCoins,
          snap.threshold,
          args.coins,
          next.thresholdCoins,
          config.carryOverflow,
        );

        await tx.rocketContribution.create({
          data: {
            eventId: event.id,
            userId: args.userId,
            coins: split.applied,
            source: args.source,
            txId: args.txId,
          },
        });

        const nextAccum = event.accumulatedCoins + split.applied;
        await tx.rocketEvent.update({
          where: { id: event.id },
          data: {
            accumulatedCoins: nextAccum,
            version: { increment: 1 },
          },
        });

        eventSnapshot = this.eventSnapshot(
          { ...event, accumulatedCoins: nextAccum },
          snap,
        );

        if (split.launches) {
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
              snap,
              nextAccum,
            );
            launched = true;

            // Next rung starts immediately (resuming its paused progress; the top level repeats).
            const { event: nextEvent, added: carry } = await this.openLevelEvent(
              tx,
              args.room.id,
              config,
              next,
              event.cycleKey ?? cycleKeyAt(new Date(), config),
              split.carry,
            );
            if (carry > 0) {
              await tx.rocketContribution.create({
                data: {
                  eventId: nextEvent.id,
                  userId: args.userId,
                  coins: carry,
                  source: args.source,
                  txId: `${args.txId}#carry`,
                },
              });
            }
            eventSnapshot = {
              ...this.eventSnapshot({ ...event, accumulatedCoins: nextAccum, status: 'LAUNCHED' }, snap),
              launch_id: launchPayload?.launch_id ?? null,
              next_event: this.eventSnapshot(nextEvent, this.snapshotFromEvent(nextEvent, config)),
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
    snap: RocketLevelSnapshot,
    accumulated: number,
    launcherId?: bigint,
  ): Promise<Record<string, unknown>> {
    const launchId = randomUUID();
    const pool = Math.floor((accumulated * Number(snap.reward_pool_percentage)) / 100);

    const aggregatesRaw = await tx.rocketContribution.groupBy({
      by: ['userId'],
      where: { eventId },
      _sum: { coins: true },
    });
    const aggregates = aggregatesRaw.filter((a) => (a._sum.coins ?? 0) > 0);

    // People in the room right now (fresh heartbeat). Top and lucky rewards go only to them.
    const setting = await tx.adminSetting
      .findUnique({ where: { id: 1 }, select: { extraSettings: true } })
      .catch(() => null);
    const cutoff = new Date(
      Date.now() - readMemberTimeoutSeconds(setting?.extraSettings as Record<string, unknown>) * 1000,
    );
    const present = await tx.roomMember.findMany({
      where: { roomId: room.id, isActive: true, lastHeartbeatAt: { gte: cutoff } },
      select: { userId: true },
    });
    const presentIds = new Set(present.map((m) => m.userId.toString()));

    const rules = snap.rules.slice(0, snap.max_winners);
    const winners = rankPresentContributors(aggregates, presentIds).slice(0, rules.length);
    const coinShares = splitByPercent(pool, rules.slice(0, winners.length));

    // Frame reward for every top winner: the level's chosen frame only (no frame when none is set,
    // so winners never get paid shop frames for free).
    const frameWinners = winners.length;
    let frameFor: (rank: number) => { id: bigint; name: string } | null = () => null;
    if (frameWinners > 0 && snap.frame_id != null) {
      const frame = await tx.frame.findFirst({
        where: { id: BigInt(snap.frame_id), isActive: true },
        select: { id: true, name: true },
      });
      frameFor = (rank) => (frame && rank < frameWinners ? frame : null);
    }

    const launcher = launcherId ?? room.hostId ?? room.ownerId;
    const topContributorId = winners[0]?.userId ?? launcher;
    const topUser = await tx.user.findUnique({
      where: { id: topContributorId },
      select: { level: true },
    });
    const jetLevel = snap.legacy_jet ? jetLevelFromUserLevel(topUser?.level) : snap.visual_tier;
    const launchVideoUrl = snap.legacy_jet
      ? null
      : await this.firstAssetUrl(
          [snap.launch_asset_key, `rocket.launch_lv${snap.level}`, `rocket.launch_lv${jetLevel}`],
          tx,
        );

    // Lucky draw: people present in the room now (contributed or not), excluding top winners.
    const topIds = new Set(winners.map((w) => w.userId.toString()));
    const luckyPercent = Number(snap.lucky_audience_percent ?? 0);
    const luckyPoolTotal = Math.floor((accumulated * Number(snap.lucky_pool_percentage ?? 0)) / 100);
    let audienceCount = 0;
    let luckyWinners: bigint[] = [];
    let luckyShares: number[] = [];
    if (luckyPercent > 0 && luckyPoolTotal > 0) {
      audienceCount = present.length;
      const candidates = present.map((m) => m.userId).filter((id) => !topIds.has(id.toString()));
      // Sorted so wallet row locks are always taken in the same order.
      luckyWinners = pickLuckyWinners(candidates, luckyPercent, luckyPoolTotal).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      luckyShares = splitLucky(luckyPoolTotal, luckyWinners.length);
    }
    const luckyPool = luckyShares.reduce((a, b) => a + b, 0);

    const xpFor = (coins: number) => Math.max(snap.min_xp, Math.round(coins * snap.xp_rate));
    const expires = new Date(Date.now() + snap.frame_days * 24 * 60 * 60 * 1000);
    for (let i = 0; i < winners.length; i++) {
      const userId = winners[i].userId;
      const coins = coinShares[i] ?? 0;
      const xp = xpFor(coins);
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
            rocket_level: snap.level,
          },
        );
      }
      if (xp > 0) {
        await tx.user.update({
          where: { id: userId },
          data: { xp: { increment: xp }, exp: { increment: xp } },
        });
      }
      const frame = frameFor(i);
      if (frame) {
        const owned = await tx.userUnlockedFrame.findUnique({
          where: { userId_frameId: { userId, frameId: frame.id } },
          select: { expiresAt: true },
        });
        if (!owned) {
          await tx.userUnlockedFrame.create({
            data: {
              userId,
              frameId: frame.id,
              coinsPaid: 0,
              unlockType: 'rocket',
              durationDays: snap.frame_days,
              expiresAt: expires,
            },
          });
        } else if (owned.expiresAt != null && owned.expiresAt < expires) {
          // Extend a timed frame; never downgrade a permanently owned one.
          await tx.userUnlockedFrame.update({
            where: { userId_frameId: { userId, frameId: frame.id } },
            data: { durationDays: snap.frame_days, expiresAt: expires },
          });
        }
      }
    }

    for (let i = 0; i < luckyWinners.length; i++) {
      await this.ledger.creditCoins(
        tx,
        luckyWinners[i],
        luckyShares[i],
        'ROCKET_REWARD',
        'Rockit lucky reward',
        `rocket_lucky_${launchId}_${luckyWinners[i]}`,
        null,
        {
          source: 'rocket',
          currency: 'coins',
          room_id: room.id,
          launch_id: launchId,
          kind: 'lucky',
          rocket_level: snap.level,
        },
      );
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
        rocketLevel: snap.legacy_jet ? null : snap.level,
        levelName: snap.legacy_jet ? null : snap.name,
        launchVideoUrl,
        themeColor: snap.legacy_jet ? null : snap.theme_color,
        luckyPool,
        luckyCount: luckyWinners.length,
        audienceCount,
        rewards: {
          create: [
            ...winners.map((w, i) => {
              const frame = frameFor(i);
              return {
                userId: w.userId,
                coins: coinShares[i] ?? 0,
                xp: xpFor(coinShares[i] ?? 0),
                frameId: frame?.id ?? null,
                frameName: frame?.name ?? null,
                frameDays: frame ? snap.frame_days : null,
                kind: 'TOP',
                rank: i + 1,
              };
            }),
            ...luckyWinners.map((userId, i) => ({
              userId,
              coins: luckyShares[i],
              xp: 0,
              kind: 'LUCKY',
            })),
          ],
        },
      },
    });

    await tx.rocketEvent.update({
      where: { id: eventId },
      data: { status: 'LAUNCHED', launchId },
    });

    return this.launchPayload(launchId, null, tx);
  }

  private async launchPayload(
    launchId: string,
    senderBalance: bigint | null,
    client: Prisma.TransactionClient = this.prisma,
  ) {
    const launch = await client.rocketLaunch.findUniqueOrThrow({
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
    // Top winners by rank first (pre-rank rows by coins), then lucky winners by coins.
    const rewards = [...launch.rewards].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'TOP' ? -1 : 1;
      if (a.rank != null && b.rank != null) return a.rank - b.rank;
      return b.coins - a.coins;
    });
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
      lucky_pool: launch.luckyPool,
      lucky_count: launch.luckyCount,
      audience_count: launch.audienceCount,
      jet_level: launch.jetLevel,
      rocket_level: launch.rocketLevel,
      level_name: launch.levelName,
      launch_video_url: launch.launchVideoUrl,
      theme_color: launch.themeColor,
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
        kind: r.kind,
        rank: r.rank,
      })),
    };
  }

  /**
   * Returns the room's PENDING event for the current cycle, creating it at the right ladder
   * level when needed. Takes a per-room advisory lock held until the transaction commits.
   */
  private async ensurePendingEvent(
    tx: Prisma.TransactionClient,
    room: RoomRow,
    config: ActiveConfig,
  ) {
    await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(hashtext(${`rocket:${room.id}`}))) AS l`;
    const now = new Date();
    const cycleKey = cycleKeyAt(now, config);
    const ladder = activeLadder(config, config.levels);
    const legacy = this.isLegacy(config);

    let pending = await tx.rocketEvent.findFirst({
      where: { roomId: room.id, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });

    // Pre-ladder event still running: adopt it into today's cycle at the first level.
    if (pending && pending.cycleKey == null && pending.expiresAt > now) {
      const snap = snapshotOf(ladder[0], config, legacy);
      const expiry = eventExpiry(now, snap.duration_seconds, config);
      pending = await tx.rocketEvent.update({
        where: { id: pending.id },
        data: {
          cycleKey,
          level: ladder[0].level,
          configSnapshot: snap as unknown as Prisma.InputJsonValue,
          expiresAt: expiry < pending.expiresAt ? expiry : pending.expiresAt,
        },
      });
    }

    // Daily reset switched off: the running event joins the forever cycle instead of being lost.
    if (pending && cycleKey === ALL_TIME_CYCLE && pending.cycleKey !== cycleKey && pending.expiresAt > now) {
      const duration = Number((pending.configSnapshot as { duration_seconds?: number } | null)?.duration_seconds ?? 0);
      pending = await tx.rocketEvent.update({
        where: { id: pending.id },
        data: { cycleKey, expiresAt: eventExpiry(now, duration, config) },
      });
    }

    if (pending && (pending.expiresAt <= now || pending.cycleKey !== cycleKey)) {
      await tx.rocketEvent.update({ where: { id: pending.id }, data: { status: 'EXPIRED' } });
      pending = null;
    }

    // Any duplicate PENDING rows (older races) are retired.
    await tx.rocketEvent.updateMany({
      where: {
        roomId: room.id,
        status: 'PENDING',
        ...(pending ? { id: { not: pending.id } } : {}),
      },
      data: { status: 'EXPIRED' },
    });
    if (pending) return pending;

    if (cycleKey === ALL_TIME_CYCLE && !legacy) {
      // Levels stay unlocked forever: continue on the highest unlocked level.
      const top = unlockedTopLevel(ladder, await this.highestLaunchedLevel(tx, room.id, cycleKey));
      const level = levelAtOrAbove(ladder, top);
      return (await this.openLevelEvent(tx, room.id, config, level, cycleKey, 0)).event;
    }

    const last = await tx.rocketEvent.findFirst({
      where: { roomId: room.id, cycleKey, status: { in: ['LAUNCHED', 'EXPIRED'] } },
      orderBy: { createdAt: 'desc' },
      select: { status: true, level: true },
    });
    const level = resolveLevel(ladder, last, config.expiryMode);
    return (await this.openLevelEvent(tx, room.id, config, level, cycleKey, 0)).event;
  }

  private createEvent(
    tx: Prisma.TransactionClient,
    roomId: string,
    config: ActiveConfig,
    level: LevelRow,
    legacy: boolean,
    cycleKey: string,
    initialCoins: number,
  ) {
    const now = new Date();
    const snap = snapshotOf(level, config, legacy);
    return tx.rocketEvent.create({
      data: {
        id: randomUUID(),
        roomId,
        configId: config.id,
        accumulatedCoins: initialCoins,
        status: 'PENDING',
        expiresAt: eventExpiry(now, snap.duration_seconds, config),
        level: level.level,
        cycleKey,
        configSnapshot: snap as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /** Frozen level rules of an event; pre-ladder rows fall back to the campaign's legacy fields. */
  private snapshotFromEvent(
    event: { configSnapshot: Prisma.JsonValue | null },
    campaign: CampaignRow,
  ): RocketLevelSnapshot {
    const raw = event.configSnapshot as Partial<RocketLevelSnapshot> | null;
    if (raw && typeof raw === 'object' && Number(raw.threshold) > 0) {
      return raw as RocketLevelSnapshot;
    }
    return snapshotOf(activeLadder(campaign, [])[0], campaign, true);
  }

  private isLegacy(config: ActiveConfig) {
    return !config.levels.some((l) => l.isActive && l.thresholdCoins > 0);
  }

  private eventSnapshot(
    event: {
      status: string;
      accumulatedCoins: number;
      expiresAt: Date;
      launchId: string | null;
    },
    snap: RocketLevelSnapshot,
  ): Record<string, unknown> {
    return {
      status: event.status,
      current_coins: event.accumulatedCoins,
      threshold: snap.threshold,
      expires_at: event.expiresAt.toISOString(),
      launch_id: event.launchId,
      level: snap.legacy_jet ? 0 : snap.level,
      level_name: snap.legacy_jet ? null : snap.name,
      theme_color: snap.legacy_jet ? null : snap.theme_color,
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
    config: ActiveConfig | null,
    event: RocketEvent | null,
  ) {
    const manager = this.isManager(room, actorId);
    const snap = event && config ? this.snapshotFromEvent(event, config) : null;
    const detail = event && snap && config ? await this.eventDetail(event, snap, config, actorId) : null;
    const ladder =
      config && snap && !snap.legacy_jet && event
        ? await this.serializeLadder(config, snap.level, room.id, event.cycleKey ?? cycleKeyAt(new Date(), config))
        : [];
    const resetAt = config ? nextResetAt(new Date(), config) : null;
    return {
      price: snap?.threshold ?? config?.launchThresholdCoins ?? 100_000,
      coin_pool_ratio: (snap?.reward_pool_percentage ?? config?.rewardPoolPercentage ?? 50) / 100,
      admin_limit: ADMIN_LIMIT,
      can_manage: manager,
      can_launch: false,
      can_select_level: manager && ladder.length > 1,
      can_contribute: joined && Boolean(detail),
      mode: 'crowdfund',
      event: detail,
      ladder,
      cycle_resets_at: resetAt?.toISOString() ?? null,
      admins: admins.map((a) => ({
        id: Number(a.userId),
        name: a.user.displayName || a.user.name || 'User',
        avatar_url: a.user.avatarUrl,
      })),
    };
  }

  private async eventDetail(
    event: { id: string; status: string; accumulatedCoins: number; expiresAt: Date; launchId: string | null },
    snap: RocketLevelSnapshot,
    config: ActiveConfig,
    actorId: bigint,
  ) {
    const my = await this.prisma.rocketContribution.aggregate({
      where: { eventId: event.id, userId: actorId },
      _sum: { coins: true },
    });
    const topRaw = await this.prisma.rocketContribution.groupBy({
      by: ['userId'],
      where: { eventId: event.id },
      _sum: { coins: true },
      orderBy: { _sum: { coins: 'desc' } },
      take: 5,
    });
    const userIds = topRaw.map((t) => t.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, displayName: true, name: true, avatarUrl: true },
    });
    const byId = new Map(users.map((u) => [u.id.toString(), u]));
    const urls = snap.legacy_jet
      ? new Map<string, string>()
      : await this.assetUrls([
          snap.station_asset_key,
          `rocket.station_lv${snap.level}`,
          snap.launch_asset_key,
          `rocket.launch_lv${snap.level}`,
          `rocket.launch_lv${snap.visual_tier}`,
        ]);
    const pick = (...keys: Array<string | null>) =>
      keys.map((k) => (k ? urls.get(k) : undefined)).find(Boolean) ?? null;

    return {
      ...this.eventSnapshot(event, snap),
      visual_tier: snap.visual_tier,
      reward_pool_percentage: snap.reward_pool_percentage,
      max_winners: snap.rules.length,
      frame_days: snap.frame_days,
      lucky_audience_percent: snap.lucky_audience_percent ?? 0,
      lucky_pool_percentage: snap.lucky_pool_percentage ?? 0,
      station_video_url: pick(snap.station_asset_key, `rocket.station_lv${snap.level}`),
      launch_video_url: pick(
        snap.launch_asset_key,
        `rocket.launch_lv${snap.level}`,
        `rocket.launch_lv${snap.visual_tier}`,
      ),
      my_contribution: my._sum.coins ?? 0,
      minimum_contribution: config.minimumContributionRequired,
      top_contributors: topRaw.map((t) => {
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

  private async serializeLadder(config: ActiveConfig, currentLevel: number, roomId: string, cycleKey: string) {
    const ladder = activeLadder(config, config.levels);
    const highest = await this.highestLaunchedLevel(this.prisma, roomId, cycleKey);
    const top = unlockedTopLevel(ladder, highest);
    const paused = await this.prisma.rocketEvent.findMany({
      where: { roomId, status: 'PAUSED', cycleKey },
      select: { level: true, accumulatedCoins: true },
    });
    const pausedCoins = new Map(paused.map((p) => [p.level, p.accumulatedCoins]));
    const urls = await this.assetUrls(
      ladder.flatMap((l) => [l.badgeAssetKey, `rocket.badge_lv${l.level}`]),
    );
    return ladder.map((l) => ({
      level: l.level,
      name: l.name,
      threshold: l.thresholdCoins,
      reward_pool_percentage: l.rewardPoolPercentage,
      max_winners: Math.max(1, parseRules(l.rewardDistributionRules).length),
      frame_days: l.frameDays,
      lucky_audience_percent: l.luckyAudiencePercent,
      lucky_pool_percentage: l.luckyPoolPercentage,
      theme_color: l.themeColor,
      visual_tier: l.visualTier,
      badge_url:
        (l.badgeAssetKey ? urls.get(l.badgeAssetKey) : undefined) ??
        urls.get(`rocket.badge_lv${l.level}`) ??
        null,
      status: ladderStatus(l.level, currentLevel, highest, top),
      paused_coins: pausedCoins.get(l.level) ?? 0,
    }));
  }

  private async assetUrls(
    keys: Array<string | null | undefined>,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<Map<string, string>> {
    const wanted = [...new Set(keys.filter((k): k is string => Boolean(k)))];
    if (wanted.length === 0) return new Map();
    const rows = await client.appFxAsset.findMany({
      where: { assetKey: { in: wanted }, isActive: true },
      select: { assetKey: true, url: true },
    });
    return new Map(rows.map((r) => [r.assetKey, r.url]));
  }

  private async firstAssetUrl(
    keys: Array<string | null | undefined>,
    client: Prisma.TransactionClient,
  ): Promise<string | null> {
    const urls = await this.assetUrls(keys, client);
    for (const k of keys) {
      const url = k ? urls.get(k) : undefined;
      if (url) return url;
    }
    return null;
  }

  private serializeCampaign(row: ActiveConfig) {
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
      daily_reset_enabled: row.dailyResetEnabled,
      reset_timezone: row.resetTimezone,
      reset_hour: row.resetHour,
      expiry_mode: row.expiryMode,
      carry_overflow: row.carryOverflow,
      levels: row.levels.map((l) => ({
        id: Number(l.id),
        level: l.level,
        name: l.name,
        threshold_coins: l.thresholdCoins,
        reward_pool_percentage: l.rewardPoolPercentage,
        max_winners_count: l.maxWinnersCount,
        reward_distribution_rules: l.rewardDistributionRules,
        frame_id: l.frameId == null ? null : Number(l.frameId),
        frame_winners: l.frameWinners,
        frame_days: l.frameDays,
        xp_rate: l.xpRate,
        min_xp: l.minXp,
        duration_seconds: l.durationSeconds,
        theme_color: l.themeColor,
        visual_tier: l.visualTier,
        launch_asset_key: l.launchAssetKey,
        station_asset_key: l.stationAssetKey,
        badge_asset_key: l.badgeAssetKey,
        lucky_audience_percent: l.luckyAudiencePercent,
        lucky_pool_percentage: l.luckyPoolPercentage,
        is_active: l.isActive,
      })),
    };
  }

  private async activeConfig(): Promise<ActiveConfig | null> {
    return this.prisma.rocketCampaignConfig.findFirst({
      where: { status: true },
      orderBy: { id: 'desc' },
      include: { levels: { orderBy: { level: 'asc' } } },
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

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { FcmService } from '../../common/fcm/fcm.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LedgerService } from '../wallet/ledger.service';
import { grantMedal } from '../medal/medal.rules';
import { ENTRY_BAR_ORDER, entryBarMedia } from '../gamification/entry-bar.rules';
import {
  SvipSettings,
  readSvipSettings,
  svipSettingsForApi,
} from './svip.config';
import {
  Membership,
  addDays,
  effectiveLevel,
  RechargeLot,
  creditExpiresAt,
  creditOf,
  graceEndsAt,
  inRenewWindow,
  maintenanceFee,
  planUnlock,
  rechargeInr,
  svipMonth,
  svipStatus,
  takeCredit,
} from './svip.rules';

type Tx = Prisma.TransactionClient;

export type SvipLevel = {
  level: number;
  name: string;
  purchasePrice: bigint;
  /** Rupees of recharge that unlock this level (0 = cannot be unlocked). */
  rechargeInr: number;
  monthlyReward: bigint;
  isActive: boolean;
  diceRefreshes: number;
  goldMineBonusDraws: number;
};

/** Game perks the user's live SVIP level gives (all zero without SVIP). */
export type SvipPerks = {
  level: number;
  diceRefreshes: number;
  goldMineBonusDraws: number;
};

/** Ledger types written by SVIP. All coin rows carry a unique reference id. */
export const SVIP_LEDGER_TYPES = [
  'SVIP_PURCHASE',
  'SVIP_UPGRADE',
  'SVIP_MAINTENANCE',
  'SVIP_MONTHLY_REWARD',
  'SVIP_ADMIN',
] as const;

const CONFIG_TTL_MS = 30_000;
const ALL_ITEMS_ON = { bubbleOn: true, roomCardOn: true, micWaveOn: true };
const RENEW_BATCH = 200;

/** Each level's frame is the frames row with this slug. */
export function svipFrameSlug(level: number) {
  return `svip${level}_frame`;
}

function svipError(code: string, message: string): never {
  throw new BadRequestException({ success: false, error: { code, message } });
}

@Injectable()
export class SvipService {
  private readonly logger = new Logger(SvipService.name);
  private cache: {
    at: number;
    settings: SvipSettings;
    levels: SvipLevel[];
  } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly fcm: FcmService,
  ) {}

  async config(): Promise<{ settings: SvipSettings; levels: SvipLevel[] }> {
    if (this.cache && Date.now() - this.cache.at < CONFIG_TTL_MS)
      return this.cache;
    const [row, levels] = await Promise.all([
      this.prisma.adminSetting.findUnique({
        where: { id: 1 },
        select: { extraSettings: true },
      }),
      this.prisma.svipLevelConfig.findMany({ orderBy: { level: 'asc' } }),
    ]);
    this.cache = {
      at: Date.now(),
      settings: readSvipSettings(
        row?.extraSettings as Record<string, unknown> | null,
      ),
      levels: levels.map((l) => ({ ...l, rechargeInr: Number(l.rechargeInr) })),
    };
    return this.cache;
  }

  invalidateConfig() {
    this.cache = null;
  }

  /** The SVIP level whose perks apply to this user now (0 = none). */
  async levelOf(userId: bigint): Promise<number> {
    const [{ settings }, m] = await Promise.all([
      this.config(),
      this.prisma.userSvip.findUnique({ where: { userId } }),
    ]);
    return effectiveLevel(m, new Date(), settings.graceDays);
  }

  async perksOf(userId: bigint): Promise<SvipPerks> {
    const [{ levels }, level] = await Promise.all([
      this.config(),
      this.levelOf(userId),
    ]);
    const row = levels.find((l) => l.level === level);
    return {
      level,
      diceRefreshes: row ? row.diceRefreshes : 0,
      goldMineBonusDraws: row ? row.goldMineBonusDraws : 0,
    };
  }

  async center(userId: bigint) {
    // A recharge that just went through shows up straight away, without waiting for the minute sweep.
    await this.syncFromRecharges(userId).catch((e) =>
      this.logger.warn(`recharge sync(${userId}) failed: ${String(e)}`),
    );
    const now = new Date();
    const month = svipMonth(now);
    const [{ settings, levels }, m, user, points, claim] = await Promise.all([
      this.config(),
      this.prisma.userSvip.findUnique({ where: { userId } }),
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { walletBalance: true },
      }),
      this.prisma.svipMonthlyPoints.findUnique({
        where: { userId_month: { userId, month } },
      }),
      this.prisma.coinTransaction.findFirst({
        where: { userId, referenceId: this.monthlyRef(month) },
        select: { id: true },
      }),
    ]);
    const status = svipStatus(m, now, settings.graceDays);
    const level = effectiveLevel(m, now, settings.graceDays);
    const current = levels.find((l) => l.level === level);
    const fee = current
      ? maintenanceFee(current.purchasePrice, settings.maintenancePct)
      : 0n;
    const lots = await this.rechargeLots(this.prisma, userId, now, settings.rechargeDays);
    const credit = creditOf(lots);
    const curCost = current && current.rechargeInr > 0 ? current.rechargeInr : 0;
    const renewOpen =
      !!m &&
      level > 0 &&
      (status === 'grace' || inRenewWindow(m.periodEndsAt, now, settings.renewDays));

    return {
      enabled: settings.enabled,
      wallet_balance: Number(user.walletBalance),
      settings: svipSettingsForApi(settings),
      me: {
        level,
        status,
        last_level: m?.level ?? 0,
        period_ends_at: m && level > 0 ? m.periodEndsAt.toISOString() : null,
        grace_ends_at:
          m && level > 0
            ? graceEndsAt(m.periodEndsAt, settings.graceDays).toISOString()
            : null,
        maintenance_fee: Number(fee),
        // Renewing with coins (the fee above) or with a recharge of this level's amount.
        can_renew: renewOpen,
        renew_recharge_inr: curCost,
        renew_opens_at:
          m && level > 0 && status === 'active'
            ? new Date(m.periodEndsAt.getTime() - settings.renewDays * 86_400_000).toISOString()
            : null,
        recharge_credit_inr: credit,
        recharge_credit_expires_at: creditExpiresAt(lots, settings.rechargeDays)?.toISOString() ?? null,
        points_this_month: Number(points?.points ?? 0n),
        monthly_reward: {
          month,
          amount: Number(current?.monthlyReward ?? 0n),
          claimed: !!claim,
          can_claim:
            status === 'active' &&
            !claim &&
            (current?.monthlyReward ?? 0n) > 0n,
        },
      },
      levels: levels.map((l) => {
        // What this level still needs: the full amount, or the difference when moving up.
        const unlockable = l.isActive && l.rechargeInr > 0;
        const kind =
          l.level === level
            ? 'current'
            : !unlockable || l.level < level
              ? 'unavailable'
              : level === 0 || status === 'expired' ? 'unlock' : status === 'grace' ? 'renew_first' : 'upgrade';
        const cost = kind === 'unlock' ? l.rechargeInr : kind === 'upgrade' ? Math.max(0, l.rechargeInr - curCost) : 0;
        return {
          level: l.level,
          name: l.name,
          recharge_inr: l.rechargeInr,
          monthly_reward: Number(l.monthlyReward),
          dice_refreshes: l.diceRefreshes,
          gold_mine_bonus_draws: l.goldMineBonusDraws,
          maintenance_fee: Number(
            maintenanceFee(l.purchasePrice, settings.maintenancePct),
          ),
          for_sale: l.isActive,
          action: kind,
          need_inr: kind === 'unlock' || kind === 'upgrade' ? Math.max(0, Math.round((cost - credit) * 100) / 100) : 0,
        };
      }),
    };
  }

  /** Paid recharges of the last `days` days with how much of each is already used. Real money only. */
  private async rechargeLots(db: Tx | PrismaService, userId: bigint, now: Date, days: number): Promise<RechargeLot[]> {
    const since = new Date(now.getTime() - days * 86_400_000);
    const rows = await db.coinPurchaseTransaction.findMany({
      where: { userId, status: 'success', paymentSource: 'RAZORPAY', createdAt: { gte: since } },
      select: { id: true, createdAt: true, amountMinor: true, currency: true, package: { select: { basePriceInr: true } } },
      orderBy: { createdAt: 'asc' },
    });
    if (rows.length === 0) return [];
    const spent = await db.svipRechargeSpend.groupBy({
      by: ['purchaseId'],
      where: { purchaseId: { in: rows.map((r) => r.id) } },
      _sum: { amountInr: true },
    });
    const used = new Map(spent.map((x) => [x.purchaseId, Number(x._sum.amountInr ?? 0)]));
    return rows.map((r) => ({
      purchaseId: r.id,
      createdAt: r.createdAt,
      amountInr: rechargeInr({
        amountMinor: r.amountMinor,
        currency: r.currency,
        basePriceInr: r.package?.basePriceInr != null ? Number(r.package.basePriceInr) : null,
      }),
      spentInr: used.get(r.id) ?? 0,
    }));
  }

  /**
   * Turns unused recharge credit into SVIP: unlocks a level, upgrades, or renews (see `planUnlock`).
   * Idempotent: every rupee used is recorded against its recharge, so nothing is counted twice.
   */
  async syncFromRecharges(userId: bigint): Promise<boolean> {
    const { settings, levels } = await this.config();
    if (!settings.enabled) return false;
    let changed = false;
    const notes: Array<{ title: string; body: string }> = [];

    await this.prisma.$transaction(async (tx) => {
      await this.lockMember(tx, userId);
      for (let step = 0; step < 5; step++) {
        const now = new Date();
        const m = await tx.userSvip.findUnique({ where: { userId } });
        const lots = await this.rechargeLots(tx, userId, now, settings.rechargeDays);
        const status = svipStatus(m, now, settings.graceDays);
        const plan = planUnlock(
          status,
          m?.level ?? 0,
          m?.periodEndsAt ?? null,
          now,
          settings.renewDays,
          creditOf(lots),
          levels,
        );
        if (!plan) break;
        const spends = takeCredit(lots, plan.cost);
        if (!spends) break;

        // Late renewals continue from the old end, so grace days are never free extra days.
        const periodEndsAt =
          plan.kind === 'buy'
            ? addDays(now, settings.periodDays)
            : plan.kind === 'renew'
              ? addDays(m!.periodEndsAt, settings.periodDays)
              : m!.periodEndsAt;
        const data = {
          level: plan.level,
          status: 'active',
          periodStartsAt: plan.kind === 'buy' ? now : plan.kind === 'renew' ? m!.periodEndsAt : m!.periodStartsAt,
          periodEndsAt,
          lastChargeAttemptAt: null,
          // A new membership wears everything; an upgrade or renewal keeps the choices.
          ...(plan.kind === 'buy' ? ALL_ITEMS_ON : {}),
        };
        await tx.userSvip.upsert({ where: { userId }, create: { userId, ...data }, update: data });
        await this.grantItems(tx, userId, plan.level, graceEndsAt(periodEndsAt, settings.graceDays), plan.kind === 'buy');
        for (const sp of spends)
          await tx.svipRechargeSpend.create({
            data: { userId, purchaseId: sp.purchaseId, amountInr: sp.amountInr, level: plan.level, kind: plan.kind },
          });
        notes.push({
          title: plan.kind === 'buy' ? `SVIP ${plan.level} unlocked` : plan.kind === 'upgrade' ? `Upgraded to SVIP ${plan.level}` : 'SVIP renewed',
          body:
            plan.kind === 'renew'
              ? `Your SVIP ${plan.level} is renewed for ${settings.periodDays} days.`
              : `Your recharge unlocked SVIP ${plan.level} for ${settings.periodDays} days.`,
        });
        changed = true;
      }
    });

    for (const n of notes)
      await this.fcm.sendUserNotification({ userId, ...n, data: { type: 'svip', outcome: 'recharge' } });
    return changed;
  }

  /** Pay the maintenance fee now (member in grace who topped up). */
  async renew(userId: bigint) {
    const outcome = await this.renewOne(userId, new Date(), true);
    if (outcome === 'not_due')
      svipError('NOT_DUE', 'Your SVIP does not need renewing yet');
    if (outcome === 'expired' || outcome === 'none')
      svipError(
        'SVIP_EXPIRED',
        'Your SVIP has ended. Recharge to unlock it again',
      );
    if (outcome === 'insufficient')
      svipError('INSUFFICIENT_BALANCE', 'Insufficient coin balance');
    return this.center(userId);
  }

  async claimMonthly(userId: bigint) {
    const { settings, levels } = await this.config();
    const now = new Date();
    const month = svipMonth(now);
    let amount = 0n;
    await this.prisma.$transaction(async (tx) => {
      await this.lockMember(tx, userId);
      const m = await tx.userSvip.findUnique({ where: { userId } });
      if (svipStatus(m, now, settings.graceDays) !== 'active') {
        svipError(
          'NOT_ACTIVE',
          'Only active SVIP members can claim monthly coins',
        );
      }
      const ref = this.monthlyRef(month);
      const prior = await tx.coinTransaction.findFirst({
        where: { userId, referenceId: ref },
      });
      if (prior) svipError('ALREADY_CLAIMED', 'You already claimed this month');
      amount = levels.find((l) => l.level === m!.level)?.monthlyReward ?? 0n;
      if (amount <= 0n)
        svipError('NO_REWARD', 'No monthly coins for this level');
      await this.ledger.creditCoins(
        tx,
        userId,
        amount,
        'SVIP_MONTHLY_REWARD',
        `SVIP ${m!.level} monthly coins`,
        ref,
        undefined,
        { source: 'svip', currency: 'coins', level: m!.level, month },
      );
    });
    return { ...(await this.center(userId)), claimed_amount: Number(amount) };
  }

  async records(userId: bigint, cursor?: string) {
    const take = 30;
    const before =
      cursor && /^\d{1,18}$/.test(cursor) ? BigInt(cursor) : undefined;
    const rows = await this.prisma.coinTransaction.findMany({
      where: {
        userId,
        type: { in: [...SVIP_LEDGER_TYPES] },
        ...(before ? { id: { lt: before } } : {}),
      },
      orderBy: { id: 'desc' },
      take: take + 1,
    });
    const page = rows.slice(0, take);
    return {
      items: page.map((r) => ({
        id: r.id.toString(),
        type: r.type,
        title: r.title,
        coins: Number(r.coinAmount),
        created_at: r.createdAt.toISOString(),
      })),
      next_cursor:
        rows.length > take ? page[page.length - 1].id.toString() : null,
    };
  }

  /** Ends memberships that are past grace. Nothing is charged automatically any more. */
  @Cron('5 * * * *')
  async processRenewals() {
    try {
      const { settings } = await this.config();
      const now = new Date();
      const ended = await this.prisma.userSvip.findMany({
        where: {
          status: { not: 'expired' },
          periodEndsAt: { lte: addDays(now, -settings.graceDays) },
        },
        select: { userId: true },
        orderBy: { periodEndsAt: 'asc' },
        take: RENEW_BATCH,
      });
      for (const { userId } of ended) {
        await this.renewOne(userId, now, false).catch((e) =>
          this.logger.warn(`expire(${userId}) failed: ${String(e)}`),
        );
      }
      // Recharge credit may now pay for a renewal (members near the end of their period, or in grace).
      const near = await this.prisma.userSvip.findMany({
        where: {
          status: { in: ['active', 'grace'] },
          periodEndsAt: { lte: addDays(now, settings.renewDays) },
        },
        select: { userId: true },
        take: RENEW_BATCH,
      });
      for (const { userId } of near)
        await this.syncFromRecharges(userId).catch((e) =>
          this.logger.warn(`recharge sync(${userId}) failed: ${String(e)}`),
        );
    } catch (e) {
      this.logger.warn(`SVIP sweep failed: ${String(e)}`);
    }
  }

  /** Every minute: users whose recharge just went through get their SVIP. */
  @Cron('* * * * *')
  async processRecharges() {
    try {
      const { settings } = await this.config();
      if (!settings.enabled) return;
      const since = new Date(Date.now() - 3 * 60_000);
      const rows = await this.prisma.coinPurchaseTransaction.findMany({
        where: { status: 'success', paymentSource: 'RAZORPAY', updatedAt: { gte: since } },
        select: { userId: true },
        distinct: ['userId'],
        take: RENEW_BATCH,
      });
      for (const { userId } of rows)
        await this.syncFromRecharges(userId).catch((e) =>
          this.logger.warn(`recharge sync(${userId}) failed: ${String(e)}`),
        );
    } catch (e) {
      this.logger.warn(`SVIP recharge sweep failed: ${String(e)}`);
    }
  }

  /**
   * One renewal attempt. A late renewal continues from the old period end, so grace days
   * are never free extra days.
   */
  async renewOne(
    userId: bigint,
    now: Date,
    manual: boolean,
  ): Promise<'renewed' | 'insufficient' | 'expired' | 'not_due' | 'none'> {
    const { settings, levels } = await this.config();
    let notify: { title: string; body: string } | null = null;

    const outcome = await this.prisma.$transaction(async (tx) => {
      await this.lockMember(tx, userId);
      const m = await tx.userSvip.findUnique({ where: { userId } });
      if (!m) return 'none' as const;
      const status = svipStatus(m, now, settings.graceDays);
      // Nothing is ever charged automatically. Active members may renew by hand in the last days of the
      // period; members in grace may renew by hand any time.
      if (
        (status === 'active' || status === 'grace') &&
        (!manual ||
          (status === 'active' && !inRenewWindow(m.periodEndsAt, now, settings.renewDays)))
      )
        return 'not_due' as const;
      if (status === 'expired' || status === 'none') {
        if (m.status !== 'expired') {
          await tx.userSvip.update({
            where: { userId },
            data: { status: 'expired' },
          });
          await this.revokeItems(tx, userId);
          notify = {
            title: 'SVIP ended',
            body: `Your SVIP ${m.level} has ended. Recharge to unlock it again.`,
          };
        }
        return 'expired' as const;
      }

      const price =
        levels.find((l) => l.level === m.level)?.purchasePrice ?? 0n;
      const fee = maintenanceFee(price, settings.maintenancePct);
      try {
        if (fee > 0n) {
          await this.debit(
            tx,
            userId,
            fee,
            'SVIP_MAINTENANCE',
            `SVIP ${m.level} monthly maintenance`,
            {
              ref: `svip_maint_${userId}_${m.periodEndsAt.getTime()}`,
              meta: {
                level: m.level,
                period_ended_at: m.periodEndsAt.toISOString(),
              },
            },
          );
        }
      } catch (e) {
        if ((e as { code?: string }).code !== 'INSUFFICIENT_BALANCE') throw e;
        await tx.userSvip.update({
          where: { userId },
          data: { status: 'grace', lastChargeAttemptAt: now },
        });
        if (m.status !== 'grace' && !manual) {
          notify = {
            title: 'SVIP renewal failed',
            body: `Add ${fee.toLocaleString('en-US')} coins within ${settings.graceDays} days to keep SVIP ${m.level}.`,
          };
        }
        return 'insufficient' as const;
      }
      const periodEndsAt = addDays(m.periodEndsAt, settings.periodDays);
      await tx.userSvip.update({
        where: { userId },
        data: {
          status: 'active',
          periodStartsAt: m.periodEndsAt,
          periodEndsAt,
          lastChargeAttemptAt: now,
        },
      });
      await this.grantItems(
        tx,
        userId,
        m.level,
        graceEndsAt(periodEndsAt, settings.graceDays),
        false,
      );
      notify = {
        title: 'SVIP renewed',
        body: `Your SVIP ${m.level} is renewed for ${settings.periodDays} days.`,
      };
      return 'renewed' as const;
    });

    if (notify) {
      const n: { title: string; body: string } = notify;
      await this.fcm.sendUserNotification({
        userId,
        ...n,
        data: { type: 'svip', outcome },
      });
    }
    return outcome;
  }

  // ---- My Items ----

  async items(userId: bigint) {
    const { settings } = await this.config();
    const [m, user] = await Promise.all([
      this.prisma.userSvip.findUnique({ where: { userId } }),
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { selectedFrameId: true, selectedEntryBarId: true },
      }),
    ]);
    const level = effectiveLevel(m, new Date(), settings.graceDays);
    const [frame, bars] = level
      ? await Promise.all([
          this.prisma.frame.findFirst({
            where: { slug: svipFrameSlug(level), isActive: true },
            select: { id: true },
          }),
          this.svipBars(this.prisma, level),
        ])
      : [null, []];
    const worn = bars.find((b) => b.id === user.selectedEntryBarId);
    // `entry_bar` (one switch) stays for app versions without the bar picker.
    const shown = worn ?? bars[0];
    return {
      level,
      bubble: level > 0 && !!m?.bubbleOn,
      room_card: level > 0 && !!m?.roomCardOn,
      mic_wave: level > 0 && !!m?.micWaveOn,
      frame: frame
        ? { id: Number(frame.id), equipped: user.selectedFrameId === frame.id }
        : null,
      entry_bar: shown
        ? { id: Number(shown.id), equipped: !!worn }
        : null,
      entry_bars: bars.map((b) => ({
        ...entryBarMedia(b),
        svip_level: b.svipLevel,
        equipped: b.id === user.selectedEntryBarId,
      })),
    };
  }

  /**
   * Bars an SVIP level may wear: its own first, then lower levels' (SVIP N may wear any bar
   * up to N). The first one is the level's default.
   */
  private svipBars(tx: Tx | PrismaService, level: number) {
    return tx.entryBar.findMany({
      where: { svipLevel: { gt: 0, lte: level }, isActive: true },
      orderBy: [{ svipLevel: 'desc' }, ...ENTRY_BAR_ORDER],
    });
  }

  /** Switch SVIP items on / off. Frame and entry bar wear or take off the level's own item. */
  async updateItems(
    userId: bigint,
    body: {
      bubble?: unknown;
      room_card?: unknown;
      mic_wave?: unknown;
      frame?: unknown;
      entry_bar?: unknown;
      /** Wear this SVIP bar (the level offers several). */
      entry_bar_id?: unknown;
    },
  ) {
    const { settings } = await this.config();
    const flag = (v: unknown) => (typeof v === 'boolean' ? v : undefined);
    await this.prisma.$transaction(async (tx) => {
      await this.lockMember(tx, userId);
      const m = await tx.userSvip.findUnique({ where: { userId } });
      const level = effectiveLevel(m, new Date(), settings.graceDays);
      if (!level) svipError('NOT_ACTIVE', 'SVIP is not active');
      await tx.userSvip.update({
        where: { userId },
        data: {
          bubbleOn: flag(body?.bubble),
          roomCardOn: flag(body?.room_card),
          micWaveOn: flag(body?.mic_wave),
        },
      });
      const wearFrame = flag(body?.frame);
      if (wearFrame !== undefined) {
        const frame = await tx.frame.findFirst({
          where: { slug: svipFrameSlug(level), isActive: true },
        });
        if (frame && wearFrame) {
          // The unlock row must follow the membership: a stale expiry makes the 10-minute frame
          // sweep swap this frame for the free one right after it is worn.
          const until = graceEndsAt(m!.periodEndsAt, settings.graceDays);
          await tx.userUnlockedFrame.upsert({
            where: { userId_frameId: { userId, frameId: frame.id } },
            create: { userId, frameId: frame.id, coinsPaid: 0, expiresAt: until, unlockType: 'svip' },
            update: { expiresAt: until, unlockType: 'svip' },
          });
          await tx.user.update({
            where: { id: userId },
            data: { selectedFrameId: frame.id },
          });
        } else if (frame) {
          await tx.user.updateMany({
            where: { id: userId, selectedFrameId: frame.id },
            data: { selectedFrameId: null },
          });
        }
      }
      const bars = await this.svipBars(tx, level);
      const pickId =
        body?.entry_bar_id === undefined || body?.entry_bar_id === null
          ? undefined
          : String(body.entry_bar_id);
      if (pickId !== undefined) {
        const pick = bars.find((b) => b.id.toString() === pickId);
        if (!pick) svipError('BAR_NOT_AVAILABLE', 'This entry bar is not part of your SVIP level');
        await tx.user.update({
          where: { id: userId },
          data: { selectedEntryBarId: pick!.id },
        });
      }
      const wearBar = flag(body?.entry_bar);
      if (pickId === undefined && wearBar !== undefined) {
        const user = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { selectedEntryBarId: true },
        });
        const worn = bars.find((b) => b.id === user.selectedEntryBarId);
        if (wearBar && !worn && bars[0]) {
          await tx.user.update({
            where: { id: userId },
            data: { selectedEntryBarId: bars[0].id },
          });
        } else if (!wearBar && worn) {
          await tx.user.updateMany({
            where: { id: userId, selectedEntryBarId: worn.id },
            data: { selectedEntryBarId: null },
          });
        }
      }
    });
    return this.items(userId);
  }

  /**
   * Own the level's frame until `until` (end of period + grace) and drop other SVIP frames.
   * `equip` wears the level's frame and entry bar (new membership / upgrade / admin grant).
   */
  private async grantItems(
    tx: Tx,
    userId: bigint,
    level: number,
    until: Date,
    equip: boolean,
  ) {
    const [frame, bar, medal] = await Promise.all([
      tx.frame.findFirst({
        where: { slug: svipFrameSlug(level), isActive: true },
      }),
      this.equipBarFor(tx, userId, level),
      tx.medal.findFirst({ where: { svipLevel: level, isActive: true } }),
    ]);
    // Other levels' SVIP medals end now (upgrade); this level's medal lasts the membership.
    await tx.userMedal.updateMany({
      where: {
        userId,
        source: 'svip',
        ...(medal ? { medalId: { not: medal.id } } : {}),
      },
      data: { expiresAt: new Date(), wornSlot: null },
    });
    if (medal) await grantMedal(tx, userId, medal.id, until, 'svip', equip);
    await tx.userUnlockedFrame.updateMany({
      where: {
        userId,
        unlockType: 'svip',
        ...(frame ? { frameId: { not: frame.id } } : {}),
      },
      data: { expiresAt: new Date() },
    });
    if (frame) {
      await tx.userUnlockedFrame.upsert({
        where: { userId_frameId: { userId, frameId: frame.id } },
        create: {
          userId,
          frameId: frame.id,
          coinsPaid: 0,
          expiresAt: until,
          unlockType: 'svip',
        },
        update: { expiresAt: until, unlockType: 'svip' },
      });
    }
    if (equip) {
      await tx.user.update({
        where: { id: userId },
        data: {
          ...(frame ? { selectedFrameId: frame.id } : {}),
          ...(bar ? { selectedEntryBarId: bar.id } : {}),
        },
      });
    }
  }

  /**
   * Bar to wear on buy / upgrade / grant: the user's own pick if it already belongs to this
   * level, else the level's default.
   */
  private async equipBarFor(tx: Tx, userId: bigint, level: number) {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { selectedEntryBar: { select: { id: true, svipLevel: true, isActive: true } } },
    });
    const own = user.selectedEntryBar;
    if (own && own.isActive && own.svipLevel === level) return own;
    return tx.entryBar.findFirst({
      where: { svipLevel: level, isActive: true },
      orderBy: ENTRY_BAR_ORDER,
    });
  }

  /** Membership ended: SVIP frames expire now; worn SVIP frame / entry bar come off. */
  private async revokeItems(tx: Tx, userId: bigint) {
    await tx.userMedal.updateMany({
      where: { userId, source: 'svip' },
      data: { expiresAt: new Date(), wornSlot: null },
    });
    await tx.userUnlockedFrame.updateMany({
      where: { userId, unlockType: 'svip' },
      data: { expiresAt: new Date() },
    });
    await tx.user.updateMany({
      where: { id: userId, selectedFrame: { category: 'svip' } },
      data: { selectedFrameId: null },
    });
    await tx.user.updateMany({
      where: { id: userId, selectedEntryBar: { svipLevel: { gt: 0 } } },
      data: { selectedEntryBarId: null },
    });
  }

  // ---- admin ----

  /** Give a level for N days without charging (support / compensation). Audited in the ledger. */
  async adminGrant(
    userRef: string,
    level: number,
    days: number,
    adminId: bigint,
  ) {
    const userId = await this.resolveUser(userRef);
    const { levels, settings } = await this.config();
    if (!levels.some((l) => l.level === level))
      svipError('LEVEL_NOT_FOUND', 'SVIP level not found');
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      svipError('VALIDATION_ERROR', 'days must be 1..365');
    }
    await this.prisma.$transaction(async (tx) => {
      await this.lockMember(tx, userId);
      const now = new Date();
      const periodEndsAt = addDays(now, days);
      const data = {
        level,
        status: 'active',
        periodStartsAt: now,
        periodEndsAt,
        lastChargeAttemptAt: null,
        ...ALL_ITEMS_ON,
      };
      await tx.userSvip.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      });
      await this.grantItems(
        tx,
        userId,
        level,
        graceEndsAt(periodEndsAt, settings.graceDays),
        true,
      );
      await this.audit(tx, userId, 'grant', adminId, { level, days });
    });
    return this.adminMember(userId);
  }

  async adminRevoke(userId: bigint, adminId: bigint) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockMember(tx, userId);
      const m = await tx.userSvip.findUnique({ where: { userId } });
      if (!m) svipError('NOT_FOUND', 'User has no SVIP');
      await tx.userSvip.update({
        where: { userId },
        data: { status: 'expired', periodEndsAt: new Date() },
      });
      await this.revokeItems(tx, userId);
      await this.audit(tx, userId, 'revoke', adminId, { level: m.level });
    });
    return this.adminMember(userId);
  }

  async adminMembers(q: { status?: string; page?: string; limit?: string }) {
    const take = Math.min(Math.max(Number(q.limit ?? 25) || 25, 1), 100);
    const page = Math.max(Number(q.page ?? 1) || 1, 1);
    const where: Prisma.UserSvipWhereInput =
      q.status && ['active', 'grace', 'expired'].includes(q.status)
        ? { status: q.status }
        : {};
    const [rows, total] = await Promise.all([
      this.prisma.userSvip.findMany({
        where,
        include: {
          user: {
            select: {
              displayId: true,
              displayName: true,
              name: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: { periodEndsAt: 'asc' },
        take,
        skip: (page - 1) * take,
      }),
      this.prisma.userSvip.count({ where }),
    ]);
    const { settings } = await this.config();
    const now = new Date();
    return {
      total,
      page,
      items: rows.map((r) => this.memberForApi(r, now, settings.graceDays)),
    };
  }

  private async adminMember(userId: bigint) {
    const { settings } = await this.config();
    const r = await this.prisma.userSvip.findUniqueOrThrow({
      where: { userId },
      include: {
        user: {
          select: {
            displayId: true,
            displayName: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
    });
    return this.memberForApi(r, new Date(), settings.graceDays);
  }

  private memberForApi(
    r: Membership & {
      userId: bigint;
      periodStartsAt: Date;
      user: {
        displayId: string;
        displayName: string | null;
        name: string | null;
        avatarUrl: string | null;
      };
    },
    now: Date,
    graceDays: number,
  ) {
    return {
      user_id: r.userId.toString(),
      display_id: r.user.displayId,
      name: r.user.displayName ?? r.user.name,
      avatar_url: r.user.avatarUrl,
      level: r.level,
      status: svipStatus(r, now, graceDays),
      effective_level: effectiveLevel(r, now, graceDays),
      period_starts_at: r.periodStartsAt.toISOString(),
      period_ends_at: r.periodEndsAt.toISOString(),
    };
  }

  /** Public display ID first (what admins see in the app), then the account id. */
  private async resolveUser(ref: string): Promise<bigint> {
    const s = String(ref ?? '').trim();
    if (!s) svipError('VALIDATION_ERROR', 'user is required');
    const byDisplay = await this.prisma.user.findUnique({
      where: { displayId: s },
      select: { id: true },
    });
    if (byDisplay) return byDisplay.id;
    if (/^\d{1,18}$/.test(s)) {
      const byId = await this.prisma.user.findUnique({
        where: { id: BigInt(s) },
        select: { id: true },
      });
      if (byId) return byId.id;
    }
    svipError('USER_NOT_FOUND', 'User not found');
  }

  // ---- helpers ----

  private monthlyRef(month: string) {
    return `svip_monthly_${month}`;
  }

  /** Serialises every SVIP write for one user (purchase, renew, claim, admin, cron). */
  private async lockMember(tx: Tx, userId: bigint) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`svip_${userId}`}))`;
  }

  private async debit(
    tx: Tx,
    userId: bigint,
    amount: bigint,
    type: string,
    title: string,
    opts: { ref: string; meta: Record<string, unknown> },
  ) {
    // No XP source: buying a status is not gift / store spend.
    await this.ledger.debitCoins(
      tx,
      userId,
      amount,
      type,
      title,
      opts.ref,
      undefined,
      {
        source: 'svip',
        currency: 'coins',
        ...opts.meta,
      },
    );
  }

  private async audit(
    tx: Tx,
    userId: bigint,
    action: string,
    adminId: bigint,
    meta: Record<string, unknown>,
  ) {
    await this.ledger.writeLedger(tx, {
      userId,
      type: 'SVIP_ADMIN',
      title: `SVIP ${action} by admin`,
      coinAmount: 0,
      meta: { source: 'svip', action, admin_id: adminId.toString(), ...meta },
    });
  }
}

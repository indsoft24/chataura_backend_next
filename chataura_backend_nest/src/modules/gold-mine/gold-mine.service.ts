import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { sanitizeMediaUrl } from '../../common/utils/catalog-media';
import { LedgerService } from '../wallet/ledger.service';
import { SvipService } from '../svip/svip.service';
import {
  GOLD_MINE_ENABLED_KEY,
  dailyAllowance,
  extendedExpiry,
  istDay,
  nextIstMidnight,
  pickPrize,
} from './gold-mine.rules';

type Tx = Prisma.TransactionClient;

type PrizeRow = Prisma.GoldMinePrizeGetPayload<{
  include: {
    frame: { select: { name: true; imageUrl: true; isActive: true } };
  };
}>;

/** What a draw won, stored on the draw row (the prize row may change or be deleted later). */
export type PrizeSnapshot = {
  name: string;
  kind: string;
  coins: number;
  frame_id: number | null;
  days: number;
  image_url: string | null;
};

function mineError(code: string, message: string): never {
  throw new BadRequestException({ success: false, error: { code, message } });
}

export function prizeImage(p: {
  imageUrl: string | null;
  frame?: { imageUrl: string | null } | null;
}): string | null {
  return (
    sanitizeMediaUrl(p.imageUrl) ?? sanitizeMediaUrl(p.frame?.imageUrl ?? null)
  );
}

export function prizeSnapshot(p: PrizeRow): PrizeSnapshot {
  return {
    name: p.name,
    kind: p.kind,
    coins: Number(p.coins),
    frame_id: p.frameId ? Number(p.frameId) : null,
    days: p.days,
    image_url: prizeImage(p),
  };
}

/**
 * Gold Mine: a user activates Mine 1 / Mine 2 with coins for a set number of days and gets free
 * Daily Treasure draws every IST day while it runs (SVIP adds bonus draws). Each draw picks from
 * the admin's weighted prize pool and pays the prize in the same transaction.
 */
@Injectable()
export class GoldMineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly svip: SvipService,
  ) {}

  async enabled(): Promise<boolean> {
    const row = await this.prisma.adminSetting.findUnique({
      where: { id: 1 },
      select: { extraSettings: true },
    });
    const v = (row?.extraSettings as Record<string, unknown> | null)?.[
      GOLD_MINE_ENABLED_KEY
    ];
    return v === true || v === 'true' || v === 1 || v === '1';
  }

  async state(userId: bigint) {
    const now = new Date();
    const day = istDay(now);
    const [enabled, plans, mines, used, prizes, perks, user] =
      await Promise.all([
        this.enabled(),
        this.prisma.goldMinePlan.findMany({ orderBy: { id: 'asc' } }),
        this.prisma.userGoldMine.findMany({ where: { userId } }),
        this.prisma.goldMineDraw.count({ where: { userId, day } }),
        this.activePrizes(this.prisma),
        this.svip.perksOf(userId),
        this.prisma.user.findUniqueOrThrow({
          where: { id: userId },
          select: { walletBalance: true },
        }),
      ]);
    const running = mines.filter((m) => m.expiresAt > now);
    const planById = new Map(plans.map((p) => [p.id, p]));
    const total = dailyAllowance(
      running.map((m) => planById.get(m.planId)?.dailyDraws ?? 0),
      perks.goldMineBonusDraws,
    );
    return {
      enabled,
      wallet_balance: Number(user.walletBalance),
      svip_level: perks.level,
      svip_bonus_draws: perks.goldMineBonusDraws,
      plans: plans.map((p) => {
        const mine = mines.find((m) => m.planId === p.id);
        return {
          id: p.id,
          name: p.name,
          price: Number(p.price),
          duration_days: p.durationDays,
          daily_draws: p.dailyDraws,
          for_sale: p.isActive,
          expires_at:
            mine && mine.expiresAt > now ? mine.expiresAt.toISOString() : null,
        };
      }),
      today: {
        day,
        total,
        used: Math.min(used, total),
        left: Math.max(0, total - used),
        resets_at: nextIstMidnight(now).toISOString(),
      },
      prizes: prizes.map((p) => ({
        id: Number(p.id),
        name: p.name,
        kind: p.kind,
        coins: Number(p.coins),
        days: p.days,
        image_url: prizeImage(p),
      })),
    };
  }

  /** Buy (or extend) a mine. */
  async activate(userId: bigint, planId: number) {
    if (!(await this.enabled()))
      mineError('GOLD_MINE_DISABLED', 'Gold Mine is not available right now');
    const plan = Number.isInteger(planId)
      ? await this.prisma.goldMinePlan.findUnique({ where: { id: planId } })
      : null;
    if (!plan)
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Mine not found' },
      });
    if (!plan.isActive)
      mineError('NOT_FOR_SALE', 'This mine is not available right now');

    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, userId);
      const now = new Date();
      const mine = await tx.userGoldMine.findUnique({
        where: { userId_planId: { userId, planId } },
      });
      try {
        const { replayed } = await this.ledger.debitCoins(
          tx,
          userId,
          plan.price,
          'GOLD_MINE_ACTIVATE',
          `${plan.name} (${plan.durationDays} days)`,
          `gold_mine_${userId}_P${planId}_${mine?.updatedAt.getTime() ?? 0}`,
          undefined,
          {
            source: 'gold_mine',
            currency: 'coins',
            plan_id: planId,
            days: plan.durationDays,
          },
        );
        if (replayed) return;
      } catch (e) {
        if ((e as { code?: string }).code === 'INSUFFICIENT_BALANCE') {
          mineError('INSUFFICIENT_BALANCE', 'Insufficient coin balance');
        }
        throw e;
      }
      const running = mine && mine.expiresAt > now;
      const data = {
        startsAt: running ? mine.startsAt : now,
        expiresAt: extendedExpiry(
          mine?.expiresAt ?? null,
          now,
          plan.durationDays,
        ),
      };
      await tx.userGoldMine.upsert({
        where: { userId_planId: { userId, planId } },
        create: { userId, planId, ...data },
        update: data,
      });
    });
    return this.state(userId);
  }

  /** One Daily Treasure draw. */
  async draw(userId: bigint) {
    const perks = await this.svip.perksOf(userId);
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, userId);
      const now = new Date();
      const day = istDay(now);
      const running = await tx.userGoldMine.findMany({
        where: { userId, expiresAt: { gt: now } },
        include: { plan: { select: { dailyDraws: true } } },
      });
      if (running.length === 0)
        mineError('NO_ACTIVE_MINE', 'Activate a Gold Mine to get daily draws');
      const total = dailyAllowance(
        running.map((m) => m.plan.dailyDraws),
        perks.goldMineBonusDraws,
      );
      const used = await tx.goldMineDraw.count({ where: { userId, day } });
      if (used >= total)
        mineError(
          'NO_DRAWS_LEFT',
          'No draws left today. Come back after midnight',
        );
      const prize = pickPrize(await this.activePrizes(tx));
      if (!prize)
        mineError(
          'NO_PRIZES',
          'Daily Treasure is being restocked. Try again later',
        );
      const snapshot = prizeSnapshot(prize);
      const draw = await tx.goldMineDraw.create({
        data: {
          userId,
          prizeId: prize.id,
          day,
          prize: snapshot,
        },
      });
      await this.payPrize(tx, userId, prize, draw.id, now);
      return { drawId: draw.id, snapshot, left: total - used - 1 };
    });
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { walletBalance: true },
    });
    return {
      draw_id: Number(result.drawId),
      prize: result.snapshot,
      draws_left: result.left,
      wallet_balance: Number(user.walletBalance),
    };
  }

  async draws(userId: bigint, cursor?: string) {
    const take = 30;
    const before =
      cursor && /^\d{1,18}$/.test(cursor) ? BigInt(cursor) : undefined;
    const rows = await this.prisma.goldMineDraw.findMany({
      where: { userId, ...(before ? { id: { lt: before } } : {}) },
      orderBy: { id: 'desc' },
      take: take + 1,
    });
    const page = rows.slice(0, take);
    return {
      items: page.map((r) => ({
        id: Number(r.id),
        prize: r.prize,
        created_at: r.createdAt.toISOString(),
      })),
      next_cursor: rows.length > take ? String(page[page.length - 1].id) : null,
    };
  }

  private async payPrize(
    tx: Tx,
    userId: bigint,
    prize: PrizeRow,
    drawId: bigint,
    now: Date,
  ) {
    if (prize.kind === 'coins') {
      await this.ledger.creditCoins(
        tx,
        userId,
        prize.coins,
        'GOLD_MINE_PRIZE',
        `Daily Treasure: ${prize.name}`,
        `gold_mine_draw_${drawId}`,
        undefined,
        { source: 'gold_mine', currency: 'coins', prize_id: Number(prize.id) },
      );
      return;
    }
    // Frame for N days: extends a timed copy, never shortens a permanent one.
    const frameId = prize.frameId!;
    const owned = await tx.userUnlockedFrame.findUnique({
      where: { userId_frameId: { userId, frameId } },
    });
    const expiresAt = extendedExpiry(owned?.expiresAt ?? null, now, prize.days);
    if (!owned) {
      await tx.userUnlockedFrame.create({
        data: {
          userId,
          frameId,
          coinsPaid: 0,
          unlockType: 'gold_mine',
          durationDays: prize.days,
          expiresAt,
        },
      });
    } else if (owned.expiresAt != null) {
      await tx.userUnlockedFrame.update({
        where: { userId_frameId: { userId, frameId } },
        data: { durationDays: prize.days, expiresAt },
      });
    }
  }

  /** Prizes that can be won now (a frame prize whose frame is gone or off is skipped). */
  private async activePrizes(tx: Tx | PrismaService): Promise<PrizeRow[]> {
    const rows = await tx.goldMinePrize.findMany({
      where: { isActive: true, weight: { gt: 0 } },
      include: {
        frame: { select: { name: true, imageUrl: true, isActive: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return rows.filter(
      (p) =>
        p.kind === 'coins' ||
        (p.kind === 'frame' && p.frame?.isActive && p.days > 0),
    );
  }

  private async lock(tx: Tx, userId: bigint) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`gold_mine_${userId}`}))`;
  }
}

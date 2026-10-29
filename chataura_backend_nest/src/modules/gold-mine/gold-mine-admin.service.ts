import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { REWARD_ONLY_FRAME_CATEGORIES } from '../wallet/ledger.service';
import {
  GOLD_MINE_ENABLED_KEY,
  PrizeInput,
  expectedCoinsPerDraw,
  istDay,
  prizeError,
} from './gold-mine.rules';
import { prizeImage } from './gold-mine.service';

type PlanInput = {
  id?: unknown;
  name?: unknown;
  price?: unknown;
  duration_days?: unknown;
  daily_draws?: unknown;
  is_active?: unknown;
};
type PrizeBody = {
  name?: unknown;
  kind?: unknown;
  coins?: unknown;
  frame_id?: unknown;
  days?: unknown;
  weight?: unknown;
  image_url?: unknown;
  is_active?: unknown;
  sort_order?: unknown;
};

/** Frames that come from their own system (role, CP/BCP, rewards, SVIP) can't be Gold Mine prizes. */
const NON_PRIZE_FRAME_CATEGORIES = new Set([
  ...REWARD_ONLY_FRAME_CATEGORIES,
  'role',
  'relationship',
]);

function str(raw: unknown): string {
  return typeof raw === 'string' ||
    typeof raw === 'number' ||
    typeof raw === 'bigint'
    ? String(raw).trim()
    : '';
}

function int(raw: unknown): number {
  const s = str(raw);
  return /^-?\d{1,9}$/.test(s) ? Number(s) : NaN;
}

function big(raw: unknown): bigint {
  const s = str(raw);
  return /^\d{1,18}$/.test(s) ? BigInt(s) : 0n;
}

function bool(raw: unknown): boolean {
  return raw === true || raw === 'true' || raw === 1 || raw === '1';
}

/** Super admin side of Gold Mine: on/off, mine prices, prize pool, payout stats. */
@Injectable()
export class GoldMineAdminService {
  private readonly logger = new Logger(GoldMineAdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  async get() {
    const now = new Date();
    const since = new Date(now.getTime() - 30 * 24 * 60 * 60_000);
    const [settings, plans, prizes, running, drawsToday, paid30, sold30] =
      await Promise.all([
        this.prisma.adminSetting.findUnique({
          where: { id: 1 },
          select: { extraSettings: true },
        }),
        this.prisma.goldMinePlan.findMany({ orderBy: { id: 'asc' } }),
        this.prisma.goldMinePrize.findMany({
          include: {
            frame: { select: { name: true, imageUrl: true, isActive: true } },
          },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        }),
        this.prisma.userGoldMine.groupBy({
          by: ['planId'],
          where: { expiresAt: { gt: now } },
          _count: { _all: true },
        }),
        this.prisma.goldMineDraw.count({ where: { day: istDay(now) } }),
        this.prisma.coinTransaction.aggregate({
          where: { type: 'GOLD_MINE_PRIZE', createdAt: { gte: since } },
          _sum: { coinAmount: true },
        }),
        this.prisma.coinTransaction.aggregate({
          where: { type: 'GOLD_MINE_ACTIVATE', createdAt: { gte: since } },
          _sum: { coinAmount: true },
        }),
      ]);
    const extra =
      (settings?.extraSettings as Record<string, unknown> | null) ?? {};
    const runningBy = new Map(running.map((r) => [r.planId, r._count._all]));
    const live = prizes.filter(
      (p) =>
        p.isActive && (p.kind === 'coins' || (p.frame?.isActive && p.days > 0)),
    );
    const ev = expectedCoinsPerDraw(live);
    const totalWeight = live.reduce((a, p) => a + p.weight, 0);
    return {
      settings: { [GOLD_MINE_ENABLED_KEY]: bool(extra[GOLD_MINE_ENABLED_KEY]) },
      plans: plans.map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.price),
        duration_days: p.durationDays,
        daily_draws: p.dailyDraws,
        is_active: p.isActive,
        running: runningBy.get(p.id) ?? 0,
        // Average coins a full period of draws pays back (without the SVIP bonus).
        expected_payout: Math.round(ev * p.dailyDraws * p.durationDays),
      })),
      prizes: prizes.map((p) => ({
        id: Number(p.id),
        name: p.name,
        kind: p.kind,
        coins: Number(p.coins),
        frame_id: p.frameId ? Number(p.frameId) : null,
        frame_name: p.frame?.name ?? null,
        days: p.days,
        weight: p.weight,
        chance_pct:
          live.includes(p) && totalWeight > 0
            ? Math.round((p.weight / totalWeight) * 10_000) / 100
            : 0,
        image_url: p.imageUrl,
        preview_url: prizeImage(p),
        is_active: p.isActive,
        sort_order: p.sortOrder,
      })),
      stats: {
        expected_coins_per_draw: Math.round(ev),
        draws_today: drawsToday,
        coins_paid_30d: Number(paid30._sum.coinAmount ?? 0n),
        coins_sold_30d: -Number(sold30._sum.coinAmount ?? 0n),
      },
    };
  }

  async update(
    body: { settings?: Record<string, unknown>; plans?: PlanInput[] },
    actorId: bigint,
  ) {
    if (body?.plans !== undefined) {
      if (!Array.isArray(body.plans)) this.invalid('plans must be an array');
      const rows = body.plans.map((p) => ({
        id: int(p.id),
        name: str(p.name).slice(0, 64),
        price: big(p.price),
        durationDays: int(p.duration_days),
        dailyDraws: int(p.daily_draws),
        isActive: bool(p.is_active),
      }));
      for (const r of rows) {
        if (
          !(await this.prisma.goldMinePlan.findUnique({ where: { id: r.id } }))
        )
          this.invalid(`unknown mine ${r.id}`);
        if (!r.name) this.invalid(`mine ${r.id}: name is required`);
        if (r.price <= 0n) this.invalid(`mine ${r.id}: price must be > 0`);
        if (!(r.durationDays >= 1 && r.durationDays <= 365))
          this.invalid(`mine ${r.id}: days must be 1–365`);
        if (!(r.dailyDraws >= 1 && r.dailyDraws <= 50))
          this.invalid(`mine ${r.id}: daily draws must be 1–50`);
      }
      await this.prisma.$transaction(
        rows.map(({ id, ...data }) =>
          this.prisma.goldMinePlan.update({ where: { id }, data }),
        ),
      );
    }
    if (body?.settings?.[GOLD_MINE_ENABLED_KEY] !== undefined) {
      const current = await this.prisma.adminSetting.findUnique({
        where: { id: 1 },
      });
      const extra = {
        ...((current?.extraSettings as Record<string, unknown>) ?? {}),
        [GOLD_MINE_ENABLED_KEY]: bool(body.settings[GOLD_MINE_ENABLED_KEY]),
      };
      await this.prisma.adminSetting.upsert({
        where: { id: 1 },
        create: { id: 1, extraSettings: extra },
        update: { extraSettings: extra },
      });
    }
    this.logger.log(`Gold Mine config updated by admin ${actorId}`);
    return this.get();
  }

  async createPrize(body: PrizeBody, actorId: bigint) {
    const data = await this.prizeData(body);
    await this.prisma.goldMinePrize.create({ data });
    this.logger.log(`Gold Mine prize "${data.name}" added by admin ${actorId}`);
    return this.get();
  }

  async updatePrize(id: bigint, body: PrizeBody, actorId: bigint) {
    if (!(await this.prisma.goldMinePrize.findUnique({ where: { id } })))
      this.notFound();
    const data = await this.prizeData(body);
    await this.prisma.goldMinePrize.update({ where: { id }, data });
    this.logger.log(`Gold Mine prize ${id} updated by admin ${actorId}`);
    return this.get();
  }

  /** Past draws keep their prize snapshot. */
  async deletePrize(id: bigint, actorId: bigint) {
    if (!(await this.prisma.goldMinePrize.findUnique({ where: { id } })))
      this.notFound();
    await this.prisma.goldMinePrize.delete({ where: { id } });
    this.logger.log(`Gold Mine prize ${id} deleted by admin ${actorId}`);
    return this.get();
  }

  private async prizeData(body: PrizeBody) {
    const kind = str(body?.kind);
    const input: PrizeInput = {
      name: str(body?.name).slice(0, 64),
      kind,
      coins: kind === 'coins' ? big(body?.coins) : 0n,
      frameId:
        kind === 'frame' && big(body?.frame_id) > 0n
          ? big(body?.frame_id)
          : null,
      days: kind === 'frame' ? int(body?.days) : 0,
      weight: int(body?.weight),
    };
    const err = prizeError(input);
    if (err) this.invalid(err);
    if (input.frameId) {
      const frame = await this.prisma.frame.findUnique({
        where: { id: input.frameId },
      });
      if (!frame) this.invalid('frame not found');
      if (
        NON_PRIZE_FRAME_CATEGORIES.has((frame.category ?? '').toLowerCase())
      ) {
        this.invalid(`${frame.category} frames can't be Gold Mine prizes`);
      }
    }
    const sort = int(body?.sort_order);
    return {
      ...input,
      imageUrl: str(body?.image_url) || null,
      isActive: body?.is_active === undefined ? true : bool(body.is_active),
      sortOrder: Number.isFinite(sort) ? sort : 0,
    };
  }

  private invalid(message: string): never {
    throw new BadRequestException({
      success: false,
      error: { code: 'VALIDATION_ERROR', message },
    });
  }

  private notFound(): never {
    throw new NotFoundException({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Prize not found' },
    });
  }
}

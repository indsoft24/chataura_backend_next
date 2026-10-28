import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  SVIP_SETTING_KEYS,
  readSvipSettings,
  svipSettingsForApi,
} from './svip.config';
import { validateLevelTable } from './svip.rules';
import { SvipService } from './svip.service';

type LevelInput = {
  level?: unknown;
  name?: unknown;
  purchase_price?: unknown;
  recharge_inr?: unknown;
  monthly_reward?: unknown;
  is_active?: unknown;
  dice_refreshes?: unknown;
  gold_mine_bonus_draws?: unknown;
};

/** Small non-negative int (perk counts); -1 = invalid. */
function toCount(raw: unknown, fallback: number): number {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = Number(str(raw));
  return Number.isInteger(n) && n >= 0 && n <= 20 ? n : -1;
}

function str(raw: unknown): string {
  return typeof raw === 'string' ||
    typeof raw === 'number' ||
    typeof raw === 'bigint'
    ? String(raw).trim()
    : '';
}

/** Rupees with up to 2 decimals; -1 = invalid. */
function toInr(raw: unknown, fallback: number): number {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const s = str(raw);
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return -1;
  return Number(s);
}

function toBig(raw: unknown): bigint {
  const s = str(raw);
  return /^-?\d{1,19}$/.test(s) ? BigInt(s) : -1n;
}

/** Super admin panel side of SVIP: level ladder + global settings. */
@Injectable()
export class SvipAdminService {
  private readonly logger = new Logger(SvipAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly svip: SvipService,
  ) {}

  async getConfig() {
    this.svip.invalidateConfig();
    const { settings, levels } = await this.svip.config();
    const counts = await this.prisma.userSvip.groupBy({
      by: ['level'],
      where: { status: { in: ['active', 'grace'] } },
      _count: { _all: true },
    });
    const members = new Map(counts.map((c) => [c.level, c._count._all]));
    return {
      settings: svipSettingsForApi(settings),
      levels: levels.map((l) => ({
        level: l.level,
        name: l.name,
        purchase_price: Number(l.purchasePrice),
        recharge_inr: l.rechargeInr,
        monthly_reward: Number(l.monthlyReward),
        is_active: l.isActive,
        dice_refreshes: l.diceRefreshes,
        gold_mine_bonus_draws: l.goldMineBonusDraws,
        members: members.get(l.level) ?? 0,
      })),
    };
  }

  /** Replace the ladder and/or settings. Levels not sent are left as they are. */
  async updateConfig(
    body: { settings?: Record<string, unknown>; levels?: LevelInput[] },
    actorId: bigint,
  ) {
    if (body?.levels !== undefined) {
      if (!Array.isArray(body.levels)) this.invalid('levels must be an array');
      const existing = await this.prisma.svipLevelConfig.findMany();
      const old = new Map(existing.map((l) => [l.level, l]));
      const incoming = body.levels.map((r) => {
        const level = Number(r.level);
        return {
          level,
          name: str(r.name).slice(0, 64),
          purchasePrice: toBig(r.purchase_price),
          rechargeInr: toInr(r.recharge_inr, Number(old.get(level)?.rechargeInr ?? 0)),
          monthlyReward: toBig(r.monthly_reward),
          isActive: r.is_active === true || r.is_active === 'true',
          diceRefreshes: toCount(
            r.dice_refreshes,
            old.get(level)?.diceRefreshes ?? 2,
          ),
          goldMineBonusDraws: toCount(
            r.gold_mine_bonus_draws,
            old.get(level)?.goldMineBonusDraws ?? 2,
          ),
        };
      });
      const badInr = incoming.find((r) => r.rechargeInr < 0);
      if (badInr)
        this.invalid(`level ${badInr.level}: recharge amount must be rupees, up to 2 decimals`);
      const badCount = incoming.find(
        (r) => r.diceRefreshes < 0 || r.goldMineBonusDraws < 0,
      );
      if (badCount)
        this.invalid(
          `level ${badCount.level}: re-rolls and bonus draws must be 0–20`,
        );
      const merged = new Map(
        existing.map((l) => [
          l.level,
          { ...l, rechargeInr: Number(l.rechargeInr) } as (typeof incoming)[number],
        ]),
      );
      for (const r of incoming) merged.set(r.level, r);
      const err = validateLevelTable([...merged.values()]);
      if (err) this.invalid(err);
      await this.prisma.$transaction(
        incoming.map((r) =>
          this.prisma.svipLevelConfig.upsert({
            where: { level: r.level },
            create: r,
            update: {
              name: r.name,
              purchasePrice: r.purchasePrice,
              rechargeInr: r.rechargeInr,
              monthlyReward: r.monthlyReward,
              isActive: r.isActive,
              diceRefreshes: r.diceRefreshes,
              goldMineBonusDraws: r.goldMineBonusDraws,
            },
          }),
        ),
      );
    }

    if (body?.settings !== undefined) {
      const current = await this.prisma.adminSetting.findUnique({
        where: { id: 1 },
      });
      const extra = {
        ...((current?.extraSettings as Record<string, unknown>) ?? {}),
      };
      for (const key of Object.values(SVIP_SETTING_KEYS)) {
        if (body.settings[key] !== undefined) extra[key] = body.settings[key];
      }
      // Store the clamped values, so what's saved is exactly what the engine uses.
      Object.assign(extra, svipSettingsForApi(readSvipSettings(extra)));
      await this.prisma.adminSetting.upsert({
        where: { id: 1 },
        create: { id: 1, extraSettings: extra as Prisma.InputJsonValue },
        update: { extraSettings: extra as Prisma.InputJsonValue },
      });
    }

    this.svip.invalidateConfig();
    const result = await this.getConfig();
    this.logger.log(
      `SVIP config updated by admin ${actorId}: ${JSON.stringify(result.settings)}`,
    );
    return result;
  }

  private invalid(message: string): never {
    throw new BadRequestException({
      success: false,
      error: { code: 'VALIDATION_ERROR', message },
    });
  }
}

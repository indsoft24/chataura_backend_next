import { randomInt } from 'crypto';
import { withWeights } from '../game/game.constants';

/** Lucky Fruit: pure rules. The phone only shows what the server decided. */
export const LF_KEYS = {
  enabled: 'lucky_fruit_enabled',
  weights: 'lucky_fruit_weights',
  bonusPct: 'lucky_fruit_bonus_pay_pct',
  maxRoundBet: 'lucky_fruit_max_round_bet',
  chestRewards: 'lucky_fruit_chest_rewards',
} as const;

/** Perimeter order, clockwise. multiplier 0 = bonus tile (cannot be bet on). */
export const LF_ITEMS: Record<string, { multiplier: number; weight: number }> = {
  orange: { multiplier: 5, weight: 1879 },
  lemon: { multiplier: 5, weight: 1879 },
  grape: { multiplier: 5, weight: 1878 },
  cherry: { multiplier: 5, weight: 1878 },
  super_lucky: { multiplier: 0, weight: 100 },
  apple: { multiplier: 10, weight: 928 },
  watermelon: { multiplier: 15, weight: 611 },
  mango: { multiplier: 25, weight: 358 },
  strawberry: { multiplier: 45, weight: 189 },
  lucky: { multiplier: 0, weight: 300 },
};
export const LF_FRUITS = Object.keys(LF_ITEMS).filter((k) => LF_ITEMS[k].multiplier > 0);
/** How many fruits light up for each bonus tile. */
export const LF_BONUS_COUNT: Record<string, number> = { lucky: 2, super_lucky: 3 };

export const LF_CHIPS = [1_000, 5_000, 10_000, 50_000, 100_000] as const;
export const LF_CHEST_TARGETS = [5_000_000, 50_000_000, 250_000_000, 500_000_000, 2_500_000_000] as const;
export const LF_BETTING_SECONDS = 30;
/** Spin (~5 s) + showdown (~2.5 s) on the phone, then the next round opens. */
export const LF_RESULT_SECONDS = 8;
/** Bets stop 1.5 s before the close; the phone stops them when the timer shows 2, so the last bettable second is 3. */
export const LF_CLOSE_GUARD_MS = 1500;

export type LuckyFruitSettings = {
  enabled: boolean;
  weights: Record<string, number>;
  bonusPct: number;
  maxRoundBet: number;
  chestRewards: number[];
};

export const LF_DEFAULTS = {
  bonusPct: 20,
  maxRoundBet: 10_000_000,
  chestRewards: [0, 0, 0, 0, 0],
};

export function validChestRewards(v: unknown): v is number[] {
  return (
    Array.isArray(v) &&
    v.length === LF_CHEST_TARGETS.length &&
    v.every((n) => Number.isSafeInteger(n) && n >= 0 && n <= 1_000_000_000)
  );
}

export function validWeights(v: unknown): v is Record<string, number> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(LF_ITEMS);
  return (
    Object.keys(o).length === keys.length &&
    keys.every((k) => typeof o[k] === 'number' && Number.isInteger(o[k]) && (o[k] as number) >= 1 && (o[k] as number) <= 10_000_000)
  );
}

export function readSettings(extra: Record<string, unknown> | null | undefined): LuckyFruitSettings {
  const e = extra ?? {};
  const odds = withWeights(LF_ITEMS, e[LF_KEYS.weights]);
  const pct = Number(e[LF_KEYS.bonusPct]);
  const max = Number(e[LF_KEYS.maxRoundBet]);
  return {
    enabled: e[LF_KEYS.enabled] === true,
    weights: Object.fromEntries(Object.entries(odds).map(([k, v]) => [k, v.weight])),
    bonusPct: Number.isInteger(pct) && pct >= 0 && pct <= 100 ? pct : LF_DEFAULTS.bonusPct,
    maxRoundBet: Number.isSafeInteger(max) && max >= 1000 && max <= 1_000_000_000 ? max : LF_DEFAULTS.maxRoundBet,
    chestRewards: validChestRewards(e[LF_KEYS.chestRewards]) ? (e[LF_KEYS.chestRewards] as number[]) : LF_DEFAULTS.chestRewards,
  };
}

export function settingsForApi(s: LuckyFruitSettings) {
  return {
    [LF_KEYS.enabled]: s.enabled,
    [LF_KEYS.weights]: s.weights,
    [LF_KEYS.bonusPct]: s.bonusPct,
    [LF_KEYS.maxRoundBet]: s.maxRoundBet,
    [LF_KEYS.chestRewards]: s.chestRewards,
  };
}

/** Long-run payout share (%) when a player backs one fruit every round. */
export function rtpByFruit(s: Pick<LuckyFruitSettings, 'weights' | 'bonusPct'>): Record<string, number> {
  const total = Object.values(s.weights).reduce((a, b) => a + b, 0);
  const lit = Object.entries(LF_BONUS_COUNT).reduce((a, [k, n]) => a + (s.weights[k] / total) * (n / LF_FRUITS.length), 0);
  return Object.fromEntries(
    LF_FRUITS.map((f) => {
      const m = LF_ITEMS[f].multiplier;
      return [f, Math.round(((s.weights[f] / total) * m + lit * m * (s.bonusPct / 100)) * 10_000) / 100];
    }),
  );
}

export function drawWinner(weights: Record<string, number>): string {
  const entries = Object.entries(weights);
  let roll = randomInt(entries.reduce((a, [, w]) => a + w, 0));
  for (const [k, w] of entries) {
    roll -= w;
    if (roll < 0) return k;
  }
  return entries[0][0];
}

/** Lucky / Super Lucky: distinct random fruits light up. */
export function drawBonusFruits(count: number): string[] {
  const pool = [...LF_FRUITS];
  const out: string[] = [];
  for (let i = 0; i < count && pool.length; i++) out.push(pool.splice(randomInt(pool.length), 1)[0]);
  return out;
}

/** What one bet pays once the round is decided. */
export function betPayout(item: string, amount: bigint, winner: string, bonus: string[], bonusPct: number): bigint {
  const m = BigInt(LF_ITEMS[item]?.multiplier ?? 0);
  if (m === 0n) return 0n;
  if (item === winner) return amount * m;
  if (bonus.includes(item)) return (amount * m * BigInt(bonusPct)) / 100n;
  return 0n;
}

const IST_OFFSET_MS = 330 * 60_000;
export function istDay(now = Date.now()): string {
  return new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);
}
export function istMidnight(now = Date.now()): Date {
  return new Date(Math.floor((now + IST_OFFSET_MS) / 86_400_000) * 86_400_000 - IST_OFFSET_MS);
}

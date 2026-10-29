import { randomInt } from 'crypto';

const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;
const DAY_MS = 24 * 60 * 60_000;

export const GOLD_MINE_ENABLED_KEY = 'gold_mine_enabled';
export const PRIZE_KINDS = ['coins', 'frame'] as const;
export type PrizeKind = (typeof PRIZE_KINDS)[number];

/** IST calendar day (YYYY-MM-DD). Draws reset at 00:00 IST. */
export function istDay(at: Date): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Next 00:00 IST after `at`. */
export function nextIstMidnight(at: Date): Date {
  const local = at.getTime() + IST_OFFSET_MS;
  return new Date(Math.floor(local / DAY_MS) * DAY_MS + DAY_MS - IST_OFFSET_MS);
}

/** Draws per day: every running mine's draws, plus the SVIP bonus once while any mine runs. */
export function dailyAllowance(
  runningDraws: number[],
  svipBonus: number,
): number {
  if (runningDraws.length === 0) return 0;
  return runningDraws.reduce((a, b) => a + b, 0) + Math.max(0, svipBonus);
}

/** Buying a mine again extends it from its current end (or from now if it has ended). */
export function extendedExpiry(
  currentExpiry: Date | null,
  now: Date,
  days: number,
): Date {
  const from = currentExpiry && currentExpiry > now ? currentExpiry : now;
  return new Date(from.getTime() + days * DAY_MS);
}

/** Weighted pick. `roll` is injectable for tests; defaults to the crypto RNG. */
export function pickPrize<T extends { weight: number }>(
  prizes: T[],
  roll: (max: number) => number = (max) => randomInt(max),
): T | null {
  const pool = prizes.filter((p) => p.weight > 0);
  const total = pool.reduce((a, p) => a + p.weight, 0);
  if (total <= 0) return null;
  let r = roll(total);
  for (const p of pool) {
    if (r < p.weight) return p;
    r -= p.weight;
  }
  return pool[pool.length - 1];
}

/** Average coins one draw pays out (frame prizes count as 0 coins). Shown to admins. */
export function expectedCoinsPerDraw(
  prizes: Array<{ weight: number; kind: string; coins: bigint }>,
): number {
  const pool = prizes.filter((p) => p.weight > 0);
  const total = pool.reduce((a, p) => a + p.weight, 0);
  if (total <= 0) return 0;
  const sum = pool.reduce(
    (a, p) => a + (p.kind === 'coins' ? Number(p.coins) * p.weight : 0),
    0,
  );
  return sum / total;
}

export type PrizeInput = {
  name: string;
  kind: string;
  coins: bigint;
  frameId: bigint | null;
  days: number;
  weight: number;
};

/** Why an admin prize is invalid, or null. */
export function prizeError(p: PrizeInput): string | null {
  if (!p.name.trim()) return 'name is required';
  if (!(PRIZE_KINDS as readonly string[]).includes(p.kind))
    return 'kind must be coins or frame';
  if (!Number.isInteger(p.weight) || p.weight < 1 || p.weight > 1_000_000)
    return 'weight must be 1–1000000';
  if (p.kind === 'coins' && (p.coins <= 0n || p.coins > 1_000_000_000n))
    return 'coins must be 1–1000000000';
  if (p.kind === 'frame') {
    if (!p.frameId) return 'pick a frame';
    if (!Number.isInteger(p.days) || p.days < 1 || p.days > 365)
      return 'days must be 1–365';
  }
  return null;
}

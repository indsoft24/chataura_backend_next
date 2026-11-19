/**
 * Lucky Spin prizes as multiples of the spin cost, so whatever bet the admin sets pays the same share back.
 * (Before, prizes were fixed 100 / 50 / 10 coins, which only made sense at a 50-coin spin.)
 */
export const SPIN_PRIZE_TABLE = [
  { name: 'x2', emoji: '💰', type: 'coins', multiplier: 2, probability: 0.12, gift_name: null as string | null },
  { name: 'x1', emoji: '🪙', type: 'coins', multiplier: 1, probability: 0.2, gift_name: null as string | null },
  { name: 'Rose', emoji: '🌹', type: 'gift', multiplier: 0.2, probability: 0.08, gift_name: 'Rose' as string | null },
  { name: 'Try again', emoji: '💨', type: 'loss', multiplier: 0, probability: 0.6, gift_name: null as string | null },
] as const;

/** Share of the bet paid back on average (0.456 = 45.6 %). */
export const SPIN_RETURN_RATE = SPIN_PRIZE_TABLE.reduce((s, p) => s + p.probability * p.multiplier, 0);

export const SPIN_MIN_COST = 10;
export const SPIN_MAX_COST = 10_000_000;

export function effectiveSpinCost(configured: number): number {
  if (!Number.isFinite(configured)) return SPIN_MIN_COST;
  return Math.min(Math.max(Math.floor(configured), SPIN_MIN_COST), SPIN_MAX_COST);
}

export type SpinPrizeRow = {
  label: string;
  emoji: string;
  type: string;
  coins: number;
  probability: number;
  gift_name: string | null;
};

const fmt = (n: number) => n.toLocaleString('en-US');

/** The wheel for one spin cost: coins and labels already worked out. */
export function prizesForCost(cost: number): SpinPrizeRow[] {
  return SPIN_PRIZE_TABLE.map((p) => {
    const coins = p.multiplier > 0 ? Math.max(1, Math.round(cost * p.multiplier)) : 0;
    return {
      label: p.type === 'coins' ? `${fmt(coins)} coins` : p.name,
      emoji: p.emoji,
      type: p.type,
      coins,
      probability: p.probability,
      gift_name: p.gift_name,
    };
  });
}

/** Picks a prize by probability; `roll` is 0..1 (injectable for tests). */
export function pickSpinPrize(rows: SpinPrizeRow[], roll = Math.random()): SpinPrizeRow {
  let r = roll;
  for (const p of rows) {
    r -= p.probability;
    if (r <= 0) return p;
  }
  return rows[rows.length - 1];
}

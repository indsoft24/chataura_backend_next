export const HISTORY_GAMES = ['greedy', 'lucky77', 'slot', 'lucky_spin'] as const;
export type HistoryGame = (typeof HISTORY_GAMES)[number];
export type HistoryResult = 'win' | 'loss' | 'even';
export const HISTORY_RESULTS: readonly HistoryResult[] = ['win', 'loss', 'even'];

export const HISTORY_PAGE_DEFAULT = 20;
export const HISTORY_PAGE_MAX = 50;

/** win / loss by the money the user ended up with, not by whether one pick hit. */
export function resultOf(totalBet: bigint, payout: bigint): HistoryResult {
  return payout > totalBet ? 'win' : payout < totalBet ? 'loss' : 'even';
}

export function parseGame(v: unknown): HistoryGame | undefined {
  return typeof v === 'string' && (HISTORY_GAMES as readonly string[]).includes(v) ? (v as HistoryGame) : undefined;
}

export function parseResult(v: unknown): HistoryResult | undefined {
  return typeof v === 'string' && (HISTORY_RESULTS as readonly string[]).includes(v) ? (v as HistoryResult) : undefined;
}

export function parseLimit(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  if (!Number.isInteger(n) || n < 1) return HISTORY_PAGE_DEFAULT;
  return Math.min(n, HISTORY_PAGE_MAX);
}

/** Cursor = the id of the last row of the previous page (ids only grow, so newest-first paging by id is stable). */
export function parseCursor(v: unknown): bigint | undefined {
  if (typeof v !== 'string' || !/^[0-9]{1,18}$/.test(v)) return undefined;
  return BigInt(v);
}

/** Period helpers for relationship leaderboards (UTC). */

export type PeriodType = 'daily' | 'weekly' | 'monthly' | 'all_time';

export const PERIOD_TYPES: PeriodType[] = [
  'daily',
  'weekly',
  'monthly',
  'all_time',
];

export function isPeriodType(raw: string | undefined | null): raw is PeriodType {
  return PERIOD_TYPES.includes(String(raw ?? '') as PeriodType);
}

/** ISO week key: YYYY-Www */
function isoWeekKey(d: Date): string {
  const date = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  const week = String(weekNo).padStart(2, '0');
  return `${date.getUTCFullYear()}-W${week}`;
}

export function periodKey(period: PeriodType, at: Date = new Date()): string {
  switch (period) {
    case 'all_time':
      return 'all';
    case 'daily':
      return at.toISOString().slice(0, 10);
    case 'monthly':
      return at.toISOString().slice(0, 7);
    case 'weekly':
      return isoWeekKey(at);
  }
}

export function canonicalUserPair(
  a: bigint,
  b: bigint,
): { userLowId: bigint; userHighId: bigint } {
  return a < b
    ? { userLowId: a, userHighId: b }
    : { userLowId: b, userHighId: a };
}

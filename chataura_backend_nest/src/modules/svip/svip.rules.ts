/**
 * SVIP rules: pure and unit-tested. The service does the I/O and calls these.
 *
 * A level is bought with coins for one period. At period end a maintenance fee
 * (pct of the purchase price) renews it; if the wallet is short the member keeps the
 * level through a grace window, then it ends.
 */

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;

export type SvipStatus = 'none' | 'active' | 'grace' | 'expired';

export type Membership = {
  level: number;
  status: string;
  periodEndsAt: Date;
};

export type LevelRow = {
  level: number;
  purchasePrice: bigint;
  isActive: boolean;
};

/** IST calendar month, "yyyy-mm". Points and the monthly reward reset on this boundary. */
export function svipMonth(at: Date): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 7);
}

export function addDays(at: Date, days: number): Date {
  return new Date(at.getTime() + days * DAY_MS);
}

export function maintenanceFee(purchasePrice: bigint, pct: number): bigint {
  return (purchasePrice * BigInt(Math.max(0, Math.floor(pct)))) / 100n;
}

export function graceEndsAt(periodEndsAt: Date, graceDays: number): Date {
  return addDays(periodEndsAt, graceDays);
}

/** Where a membership stands at `now`. Dates win over the stored status, except a hard expiry. */
export function svipStatus(
  m: Membership | null,
  now: Date,
  graceDays: number,
): SvipStatus {
  if (!m) return 'none';
  if (m.status === 'expired') return 'expired';
  if (now < m.periodEndsAt) return 'active';
  if (now < graceEndsAt(m.periodEndsAt, graceDays)) return 'grace';
  return 'expired';
}

/** The level whose perks apply right now (grace keeps them). 0 = no SVIP. */
export function effectiveLevel(
  m: Membership | null,
  now: Date,
  graceDays: number,
): number {
  const s = svipStatus(m, now, graceDays);
  return s === 'active' || s === 'grace' ? m!.level : 0;
}

export type PurchaseError =
  | 'LEVEL_NOT_FOUND'
  | 'LEVEL_NOT_FOR_SALE'
  | 'ALREADY_ACTIVE'
  | 'DOWNGRADE_NOT_ALLOWED'
  | 'RENEW_FIRST';

export type PurchaseQuote =
  | { ok: true; kind: 'buy' | 'upgrade'; cost: bigint }
  | { ok: false; error: PurchaseError };

/**
 * What buying `targetLevel` costs. New or expired members pay the full price.
 * Active members may only move up, paying the price difference. A member in grace must renew first.
 */
export function quotePurchase(
  status: SvipStatus,
  currentLevel: number,
  targetLevel: number,
  levels: LevelRow[],
): PurchaseQuote {
  const target = levels.find((l) => l.level === targetLevel);
  if (!target) return { ok: false, error: 'LEVEL_NOT_FOUND' };
  if (!target.isActive) return { ok: false, error: 'LEVEL_NOT_FOR_SALE' };
  if (status === 'none' || status === 'expired') {
    return { ok: true, kind: 'buy', cost: target.purchasePrice };
  }
  if (status === 'grace') return { ok: false, error: 'RENEW_FIRST' };
  if (targetLevel === currentLevel)
    return { ok: false, error: 'ALREADY_ACTIVE' };
  if (targetLevel < currentLevel)
    return { ok: false, error: 'DOWNGRADE_NOT_ALLOWED' };
  const current = levels.find((l) => l.level === currentLevel);
  const diff = target.purchasePrice - (current?.purchasePrice ?? 0n);
  return { ok: true, kind: 'upgrade', cost: diff > 0n ? diff : 0n };
}

/** Ladder sanity for admin edits: levels 1..9, unique, prices rising with level, no negatives. */
export function validateLevelTable(
  rows: Array<{
    level: number;
    name: string;
    purchasePrice: bigint;
    monthlyReward: bigint;
  }>,
): string | null {
  const seen = new Set<number>();
  for (const r of rows) {
    if (!Number.isInteger(r.level) || r.level < 1 || r.level > 9)
      return `invalid level ${r.level}`;
    if (seen.has(r.level)) return `duplicate level ${r.level}`;
    seen.add(r.level);
    if (!r.name.trim()) return `level ${r.level}: name required`;
    if (r.purchasePrice <= 0n)
      return `level ${r.level}: purchase price must be > 0`;
    if (r.monthlyReward < 0n)
      return `level ${r.level}: monthly reward must be >= 0`;
  }
  const sorted = [...rows].sort((a, b) => a.level - b.level);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].purchasePrice <= sorted[i - 1].purchasePrice) {
      return `level ${sorted[i].level} must cost more than level ${sorted[i - 1].level}`;
    }
  }
  return null;
}

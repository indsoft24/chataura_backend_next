/**
 * SVIP rules: pure and unit-tested. The service does the I/O and calls these.
 *
 * A level is earned by real-money recharge (rupees per level, inside a rolling window) for one period.
 * Before the period ends the member renews with the maintenance fee (pct of the purchase price, in coins)
 * or by recharging again. After the period a grace window keeps the level, then it ends.
 */

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;

export type SvipStatus = 'none' | 'active' | 'grace' | 'expired';

export type Membership = {
  level: number;
  status: string;
  periodEndsAt: Date;
  source?: string;
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

/** Free promo SVIP ends the moment its period does; every other membership gets the grace window. */
export function graceFor(m: { source?: string } | null, graceDays: number): number {
  return m?.source === 'promo' ? 0 : graceDays;
}

/** Gifted (admin / seller) and promo SVIP renews by recharge only: the coin fee would make it free. */
export function renewsByRechargeOnly(m: { source?: string } | null): boolean {
  return !!m && !!m.source && m.source !== 'recharge';
}

/**
 * A gift on top of a live membership: higher = upgrade (keeps the longer end), same = adds days,
 * lower = blocked unless `allowLower` (admin only). No live membership = a fresh start.
 */
export function planGift(
  m: { level: number; periodEndsAt: Date } | null,
  live: boolean,
  level: number,
  days: number,
  now: Date,
  allowLower: boolean,
): { kind: 'new' | 'upgrade' | 'extend'; periodEndsAt: Date } | 'lower' {
  if (!m || !live) return { kind: 'new', periodEndsAt: addDays(now, days) };
  if (level < m.level) return allowLower ? { kind: 'new', periodEndsAt: addDays(now, days) } : 'lower';
  if (level === m.level) return { kind: 'extend', periodEndsAt: addDays(m.periodEndsAt, days) };
  const fresh = addDays(now, days);
  return { kind: 'upgrade', periodEndsAt: fresh > m.periodEndsAt ? fresh : m.periodEndsAt };
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
  if (now < graceEndsAt(m.periodEndsAt, graceFor(m, graceDays))) return 'grace';
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

/** Coins received (Razorpay recharge or from a coin seller) that may still pay for SVIP, and how much is used. */
export type RechargeLot = {
  /** 'p:<purchase id>' (Razorpay) or 't:<coin transaction id>' (seller transfer). */
  key: string;
  createdAt: Date;
  coins: number;
  spent: number;
};

export function creditOf(lots: RechargeLot[]): number {
  return lots.reduce((t, l) => t + Math.max(0, l.coins - l.spent), 0);
}

/** Uses `need` coins of credit, oldest lot first. null = not enough credit. */
export function takeCredit(
  lots: RechargeLot[],
  need: number,
): Array<{ key: string; coins: number }> | null {
  if (creditOf(lots) < need) return null;
  const out: Array<{ key: string; coins: number }> = [];
  let left = need;
  for (const l of [...lots].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    if (left <= 0) break;
    const free = l.coins - l.spent;
    if (free <= 0) continue;
    const take = Math.min(free, left);
    out.push({ key: l.key, coins: take });
    left -= take;
  }
  return out;
}

/** Earliest moment some unused credit runs out (receive time + window). null = no credit. */
export function creditExpiresAt(lots: RechargeLot[], windowDays: number): Date | null {
  const live = lots.filter((l) => l.coins - l.spent > 0);
  if (live.length === 0) return null;
  const first = Math.min(...live.map((l) => l.createdAt.getTime()));
  return addDays(new Date(first), windowDays);
}

export type LevelRecharge = { level: number; rechargeCoins: number; renewCoins: number; isActive: boolean };

export type UnlockPlan = {
  kind: 'buy' | 'upgrade' | 'renew';
  level: number;
  /** Coins of credit this step uses. */
  cost: number;
};

/** Is the period close enough to its end for an early renewal (by coins or by recharge)? */
export function inRenewWindow(periodEndsAt: Date, now: Date, renewDays: number): boolean {
  return periodEndsAt.getTime() - now.getTime() <= renewDays * DAY_MS;
}

/**
 * What the member's unused recharge credit pays for right now (one step; callers repeat until null).
 *  - no SVIP / ended: the highest level the credit reaches (full recharge amount).
 *  - active: an upgrade to the highest level the credit reaches (pays the difference);
 *    otherwise a renewal of the current level once inside the renew window.
 *  - in grace: renew the current level.
 */
export function planUnlock(
  status: SvipStatus,
  currentLevel: number,
  periodEndsAt: Date | null,
  now: Date,
  renewDays: number,
  credit: number,
  levels: LevelRecharge[],
): UnlockPlan | null {
  const sellable = levels.filter((l) => l.isActive && l.rechargeCoins > 0);
  const cur = levels.find((l) => l.level === currentLevel);
  const curCost = cur && cur.rechargeCoins > 0 ? cur.rechargeCoins : 0;
  const reach = (cost: (l: LevelRecharge) => number, from: number) =>
    sellable
      .filter((l) => l.level > from && cost(l) <= credit)
      .sort((a, b) => b.level - a.level)[0];

  if (status === 'none' || status === 'expired') {
    const best = reach((l) => l.rechargeCoins, 0);
    return best ? { kind: 'buy', level: best.level, cost: best.rechargeCoins } : null;
  }
  if (curCost <= 0) return null;
  if (status === 'active') {
    const up = reach((l) => l.rechargeCoins - curCost, currentLevel);
    if (up) return { kind: 'upgrade', level: up.level, cost: up.rechargeCoins - curCost };
  }
  const renewCost = cur && cur.renewCoins > 0 ? cur.renewCoins : curCost;
  const canRenew =
    status === 'grace' || (periodEndsAt != null && inRenewWindow(periodEndsAt, now, renewDays));
  if (canRenew && credit >= renewCost) return { kind: 'renew', level: currentLevel, cost: renewCost };
  return null;
}

/** Ladder sanity for admin edits: levels 1..9, unique, prices rising with level, no negatives. */
export function validateLevelTable(
  rows: Array<{
    level: number;
    name: string;
    purchasePrice: bigint;
    monthlyReward: bigint;
    rechargeCoins?: number;
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
    if (r.rechargeCoins !== undefined && !(r.rechargeCoins >= 0))
      return `level ${r.level}: recharge coins must be >= 0`;
  }
  const sorted = [...rows].sort((a, b) => a.level - b.level);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].purchasePrice <= sorted[i - 1].purchasePrice) {
      return `level ${sorted[i].level} must cost more than level ${sorted[i - 1].level}`;
    }
  }
  const unlockable = sorted.filter((r) => (r.rechargeCoins ?? 0) > 0);
  for (let i = 1; i < unlockable.length; i++) {
    if ((unlockable[i].rechargeCoins ?? 0) <= (unlockable[i - 1].rechargeCoins ?? 0))
      return `level ${unlockable[i].level} needs a bigger recharge than level ${unlockable[i - 1].level}`;
  }
  return null;
}

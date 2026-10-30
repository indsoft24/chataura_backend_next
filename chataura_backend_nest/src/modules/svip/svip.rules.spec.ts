import {
  effectiveLevel,
  RechargeLot,
  creditExpiresAt,
  creditOf,
  maintenanceFee,
  planGift,
  planUnlock,
  renewsByRechargeOnly,
  rechargeInr,
  svipMonth,
  svipStatus,
  takeCredit,
  validateLevelTable,
} from './svip.rules';

const DAY = 86_400_000;
const now = new Date(Date.UTC(2026, 9, 25, 12, 0, 0));
const levels = [
  { level: 1, rechargeInr: 500, isActive: true },
  { level: 2, rechargeInr: 1500, isActive: true },
  { level: 3, rechargeInr: 4000, isActive: false },
];

describe('svipMonth', () => {
  it('uses the IST calendar month', () => {
    expect(svipMonth(new Date(Date.UTC(2026, 9, 31, 18, 29)))).toBe('2026-10');
    // 18:30 UTC on the 31st is 00:00 IST on 1 Nov
    expect(svipMonth(new Date(Date.UTC(2026, 9, 31, 18, 30)))).toBe('2026-11');
  });
});

describe('maintenanceFee', () => {
  it('is a floor percentage of the purchase price', () => {
    expect(maintenanceFee(6_000_000n, 20)).toBe(1_200_000n);
    expect(maintenanceFee(999n, 20)).toBe(199n);
    expect(maintenanceFee(6_000_000n, 0)).toBe(0n);
  });
});

describe('svipStatus / effectiveLevel', () => {
  const m = (endsInDays: number, status = 'active') => ({
    level: 2,
    status,
    periodEndsAt: new Date(now.getTime() + endsInDays * DAY),
  });

  it('is active before period end and grace for graceDays after', () => {
    expect(svipStatus(m(1), now, 3)).toBe('active');
    expect(svipStatus(m(-1), now, 3)).toBe('grace');
    expect(svipStatus(m(-3), now, 3)).toBe('expired');
    expect(svipStatus(null, now, 3)).toBe('none');
  });

  it('keeps perks through grace, drops them after', () => {
    expect(effectiveLevel(m(1), now, 3)).toBe(2);
    expect(effectiveLevel(m(-2), now, 3)).toBe(2);
    expect(effectiveLevel(m(-4), now, 3)).toBe(0);
  });

  it('honours a hard expiry (admin revoke) even inside the period', () => {
    expect(effectiveLevel(m(10, 'expired'), now, 3)).toBe(0);
  });

  it('zero grace days ends at period end', () => {
    expect(svipStatus(m(-0.01), now, 0)).toBe('expired');
  });
});

describe('recharge credit', () => {
  const lot = (id: number, amountInr: number, daysAgo: number, spentInr = 0): RechargeLot => ({
    purchaseId: BigInt(id),
    createdAt: new Date(now.getTime() - daysAgo * DAY),
    amountInr,
    spentInr,
  });

  it('values a pack: base INR price first, INR amount otherwise, foreign money with no base counts for nothing', () => {
    expect(rechargeInr({ amountMinor: 50000, currency: 'INR' })).toBe(500);
    expect(rechargeInr({ amountMinor: 599, currency: 'USD', basePriceInr: 499 })).toBe(499);
    expect(rechargeInr({ amountMinor: 599, currency: 'USD' })).toBe(0);
  });

  it('five recharges of 100 add up to 500', () => {
    const lots = [1, 2, 3, 4, 5].map((i) => lot(i, 100, 5 - i));
    expect(creditOf(lots)).toBe(500);
  });

  it('takes credit oldest first and leaves the rest of a partly used recharge', () => {
    const lots = [lot(1, 300, 4), lot(2, 300, 1)];
    expect(takeCredit(lots, 500)).toEqual([
      { purchaseId: 1n, amountInr: 300 },
      { purchaseId: 2n, amountInr: 200 },
    ]);
    expect(takeCredit(lots, 700)).toBeNull();
    expect(creditOf([lot(1, 300, 4, 300), lot(2, 300, 1, 200)])).toBe(100);
  });

  it('credit runs out one window after the oldest unused recharge', () => {
    const lots = [lot(1, 100, 4, 100), lot(2, 100, 3), lot(3, 100, 1)];
    expect(creditExpiresAt(lots, 5)?.getTime()).toBe(now.getTime() + 2 * DAY);
    expect(creditExpiresAt([lot(1, 100, 4, 100)], 5)).toBeNull();
  });
});

describe('planUnlock', () => {
  const end = (days: number) => new Date(now.getTime() + days * DAY);

  it('no SVIP / ended: unlocks the highest level the credit reaches, for its full amount', () => {
    expect(planUnlock('none', 0, null, now, 5, 500, levels)).toEqual({ kind: 'buy', level: 1, cost: 500 });
    expect(planUnlock('none', 0, null, now, 5, 499, levels)).toBeNull();
    expect(planUnlock('expired', 1, end(-10), now, 5, 1500, levels)).toEqual({ kind: 'buy', level: 2, cost: 1500 });
    // off-sale level 3 is never unlocked
    expect(planUnlock('none', 0, null, now, 5, 9000, levels)).toEqual({ kind: 'buy', level: 2, cost: 1500 });
  });

  it('active: upgrades for the difference first, else renews inside the renew window only', () => {
    expect(planUnlock('active', 1, end(20), now, 5, 1000, levels)).toEqual({ kind: 'upgrade', level: 2, cost: 1000 });
    expect(planUnlock('active', 1, end(20), now, 5, 999, levels)).toBeNull();
    expect(planUnlock('active', 1, end(20), now, 5, 500, levels)).toBeNull(); // too early to renew
    expect(planUnlock('active', 1, end(4), now, 5, 500, levels)).toEqual({ kind: 'renew', level: 1, cost: 500 });
    expect(planUnlock('active', 2, end(1), now, 5, 1499, levels)).toBeNull();
  });

  it('grace: renews the current level, never moves up or down', () => {
    expect(planUnlock('grace', 1, end(-1), now, 5, 500, levels)).toEqual({ kind: 'renew', level: 1, cost: 500 });
    expect(planUnlock('grace', 1, end(-1), now, 5, 1500, levels)).toEqual({ kind: 'renew', level: 1, cost: 500 });
    expect(planUnlock('grace', 2, end(-1), now, 5, 500, levels)).toBeNull();
  });

  it('a level with no recharge amount cannot be renewed by recharge', () => {
    const lv = [{ level: 1, rechargeInr: 0, isActive: true }];
    expect(planUnlock('grace', 1, end(-1), now, 5, 9999, lv)).toBeNull();
    expect(planUnlock('none', 0, null, now, 5, 9999, lv)).toBeNull();
  });
});

describe('validateLevelTable', () => {
  const row = (level: number, price: bigint) => ({
    level,
    name: `SVIP ${level}`,
    purchasePrice: price,
    monthlyReward: 0n,
    rechargeInr: Number(price) * 10,
  });

  it('accepts a rising ladder', () => {
    expect(validateLevelTable([row(2, 20n), row(1, 10n)])).toBeNull();
  });

  it('rejects bad ladders', () => {
    expect(validateLevelTable([row(1, 10n), row(2, 10n)])).toMatch(
      /must cost more/,
    );
    expect(validateLevelTable([row(1, 10n), row(1, 20n)])).toMatch(/duplicate/);
    expect(validateLevelTable([row(10, 10n)])).toMatch(/invalid level/);
    expect(validateLevelTable([row(1, 0n)])).toMatch(/> 0/);
    expect(
      validateLevelTable([
        { ...row(1, 10n), rechargeInr: 500 },
        { ...row(2, 20n), rechargeInr: 500 },
      ]),
    ).toMatch(/bigger recharge/);
    expect(validateLevelTable([{ ...row(1, 10n), rechargeInr: -1 }])).toMatch(/recharge amount/);
  });
});

describe('gifted and promo SVIP', () => {
  const end = new Date(now.getTime() + 10 * DAY);
  const m = (source: string, e = end) => ({ level: 1, status: 'active', periodEndsAt: e, source });

  it('promo has no grace; others keep it', () => {
    const past = new Date(now.getTime() - 1 * DAY);
    expect(svipStatus(m('promo', past), now, 3)).toBe('expired');
    expect(svipStatus(m('recharge', past), now, 3)).toBe('grace');
    expect(svipStatus(m('seller', past), now, 3)).toBe('grace');
  });

  it('only recharge memberships may renew by coin fee', () => {
    expect(renewsByRechargeOnly(m('recharge'))).toBe(false);
    for (const s of ['admin', 'seller', 'promo']) expect(renewsByRechargeOnly(m(s))).toBe(true);
    expect(renewsByRechargeOnly(null)).toBe(false);
  });

  it('planGift: new / extend / upgrade / lower', () => {
    expect(planGift(null, false, 1, 30, now, false)).toEqual({ kind: 'new', periodEndsAt: new Date(now.getTime() + 30 * DAY) });
    expect(planGift({ level: 1, periodEndsAt: end }, true, 1, 30, now, false)).toEqual({
      kind: 'extend',
      periodEndsAt: new Date(end.getTime() + 30 * DAY),
    });
    // upgrade keeps the longer end
    expect(planGift({ level: 1, periodEndsAt: end }, true, 2, 5, now, false)).toEqual({ kind: 'upgrade', periodEndsAt: end });
    expect(planGift({ level: 1, periodEndsAt: end }, true, 2, 30, now, false)).toEqual({
      kind: 'upgrade',
      periodEndsAt: new Date(now.getTime() + 30 * DAY),
    });
    expect(planGift({ level: 2, periodEndsAt: end }, true, 1, 30, now, false)).toBe('lower');
    expect(planGift({ level: 2, periodEndsAt: end }, true, 1, 30, now, true)).toMatchObject({ kind: 'new' });
    // an ended membership is a fresh start, even for a lower level
    expect(planGift({ level: 3, periodEndsAt: end }, false, 1, 30, now, false)).toMatchObject({ kind: 'new' });
  });
});

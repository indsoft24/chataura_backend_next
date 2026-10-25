import {
  effectiveLevel,
  maintenanceFee,
  quotePurchase,
  svipMonth,
  svipStatus,
  validateLevelTable,
} from './svip.rules';

const DAY = 86_400_000;
const now = new Date(Date.UTC(2026, 9, 25, 12, 0, 0));
const levels = [
  { level: 1, purchasePrice: 6_000_000n, isActive: true },
  { level: 2, purchasePrice: 18_000_000n, isActive: true },
  { level: 3, purchasePrice: 45_000_000n, isActive: false },
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

describe('quotePurchase', () => {
  it('charges full price to new and expired members', () => {
    expect(quotePurchase('none', 0, 1, levels)).toEqual({
      ok: true,
      kind: 'buy',
      cost: 6_000_000n,
    });
    expect(quotePurchase('expired', 2, 1, levels)).toEqual({
      ok: true,
      kind: 'buy',
      cost: 6_000_000n,
    });
  });

  it('charges the price difference on upgrade', () => {
    expect(quotePurchase('active', 1, 2, levels)).toEqual({
      ok: true,
      kind: 'upgrade',
      cost: 12_000_000n,
    });
  });

  it('rejects same level, downgrade, grace, unknown and off-sale levels', () => {
    expect(quotePurchase('active', 1, 1, levels)).toEqual({
      ok: false,
      error: 'ALREADY_ACTIVE',
    });
    expect(quotePurchase('active', 2, 1, levels)).toEqual({
      ok: false,
      error: 'DOWNGRADE_NOT_ALLOWED',
    });
    expect(quotePurchase('grace', 1, 2, levels)).toEqual({
      ok: false,
      error: 'RENEW_FIRST',
    });
    expect(quotePurchase('none', 0, 7, levels)).toEqual({
      ok: false,
      error: 'LEVEL_NOT_FOUND',
    });
    expect(quotePurchase('none', 0, 3, levels)).toEqual({
      ok: false,
      error: 'LEVEL_NOT_FOR_SALE',
    });
  });
});

describe('validateLevelTable', () => {
  const row = (level: number, price: bigint) => ({
    level,
    name: `SVIP ${level}`,
    purchasePrice: price,
    monthlyReward: 0n,
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
  });
});

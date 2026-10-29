import {
  dailyAllowance,
  expectedCoinsPerDraw,
  extendedExpiry,
  istDay,
  nextIstMidnight,
  pickPrize,
  prizeError,
} from './gold-mine.rules';

describe('gold mine rules', () => {
  it('uses the IST day and resets at IST midnight', () => {
    expect(istDay(new Date('2026-10-27T18:29:00Z'))).toBe('2026-10-27');
    expect(istDay(new Date('2026-10-27T18:30:00Z'))).toBe('2026-10-28');
    expect(
      nextIstMidnight(new Date('2026-10-27T10:00:00Z')).toISOString(),
    ).toBe('2026-10-27T18:30:00.000Z');
    expect(
      nextIstMidnight(new Date('2026-10-27T18:30:00Z')).toISOString(),
    ).toBe('2026-10-28T18:30:00.000Z');
  });

  it('sums running mines and adds the SVIP bonus once', () => {
    expect(dailyAllowance([], 2)).toBe(0);
    expect(dailyAllowance([3], 0)).toBe(3);
    expect(dailyAllowance([3], 2)).toBe(5);
    expect(dailyAllowance([7], 2)).toBe(9);
    expect(dailyAllowance([3, 7], 2)).toBe(12);
  });

  it('extends from the current end, or from now once ended', () => {
    const now = new Date('2026-10-27T00:00:00Z');
    expect(extendedExpiry(null, now, 30).toISOString()).toBe(
      '2026-11-26T00:00:00.000Z',
    );
    expect(
      extendedExpiry(new Date('2026-11-01T00:00:00Z'), now, 30).toISOString(),
    ).toBe('2026-12-01T00:00:00.000Z');
    expect(
      extendedExpiry(new Date('2026-10-01T00:00:00Z'), now, 30).toISOString(),
    ).toBe('2026-11-26T00:00:00.000Z');
  });

  it('picks by weight and skips zero weights', () => {
    const prizes = [
      { id: 'a', weight: 1 },
      { id: 'z', weight: 0 },
      { id: 'b', weight: 3 },
    ];
    expect(pickPrize(prizes, () => 0)?.id).toBe('a');
    expect(pickPrize(prizes, () => 1)?.id).toBe('b');
    expect(pickPrize(prizes, () => 3)?.id).toBe('b');
    expect(pickPrize([{ weight: 0 }])).toBeNull();
    expect(pickPrize([])).toBeNull();
  });

  it('computes the average coin payout', () => {
    expect(
      expectedCoinsPerDraw([
        { weight: 3, kind: 'coins', coins: 100n },
        { weight: 1, kind: 'frame', coins: 0n },
      ]),
    ).toBe(75);
    expect(expectedCoinsPerDraw([])).toBe(0);
  });

  it('validates admin prizes', () => {
    const base = {
      name: 'Coins',
      kind: 'coins',
      coins: 1000n,
      frameId: null,
      days: 0,
      weight: 10,
    };
    expect(prizeError(base)).toBeNull();
    expect(prizeError({ ...base, coins: 0n })).toMatch(/coins/);
    expect(prizeError({ ...base, weight: 0 })).toMatch(/weight/);
    expect(prizeError({ ...base, kind: 'gems' })).toMatch(/kind/);
    expect(prizeError({ ...base, kind: 'frame' })).toMatch(/frame/);
    expect(
      prizeError({ ...base, kind: 'frame', frameId: 5n, days: 7 }),
    ).toBeNull();
    expect(
      prizeError({ ...base, kind: 'frame', frameId: 5n, days: 0 }),
    ).toMatch(/days/);
  });
});

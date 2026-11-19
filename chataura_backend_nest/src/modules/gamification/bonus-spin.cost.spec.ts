import { SPIN_MAX_COST, SPIN_MIN_COST, SPIN_RETURN_RATE, effectiveSpinCost, pickSpinPrize, prizesForCost } from './spin-prizes';

describe('lucky spin bet', () => {
  it('pays back the same share at any bet (house keeps more than 10 %)', () => {
    expect(SPIN_RETURN_RATE).toBeLessThanOrEqual(0.9);
    for (const cost of [50, 1_000, 10_000, 250_000]) {
      const rows = prizesForCost(cost);
      const expected = rows.reduce((s, p) => s + p.probability * p.coins, 0);
      expect(expected / cost).toBeCloseTo(SPIN_RETURN_RATE, 1);
    }
  });
  it('scales the wheel with the bet and labels it with plain numbers', () => {
    const rows = prizesForCost(10_000);
    expect(rows.map((r) => [r.label, r.coins])).toEqual([['20,000 coins', 20_000], ['10,000 coins', 10_000], ['Rose', 2_000], ['Try again', 0]]);
    expect(prizesForCost(50).map((r) => r.coins)).toEqual([100, 50, 10, 0]); // the old fixed wheel
  });
  it('keeps the bet inside the allowed range', () => {
    expect(effectiveSpinCost(0)).toBe(SPIN_MIN_COST);
    expect(effectiveSpinCost(Number.NaN)).toBe(SPIN_MIN_COST);
    expect(effectiveSpinCost(99_999_999_999)).toBe(SPIN_MAX_COST);
    expect(effectiveSpinCost(1000)).toBe(1000);
  });
  it('picks by probability', () => {
    const rows = prizesForCost(100);
    expect(pickSpinPrize(rows, 0).type).toBe('coins');
    expect(pickSpinPrize(rows, 0.999).type).toBe('loss');
  });
});

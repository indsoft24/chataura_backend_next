import { SPIN_EXPECTED_PAYOUT, SPIN_MIN_COST, effectiveSpinCost } from './bonus-spin.service';

describe('spin cost floor', () => {
  it('house keeps at least 10% even at the cheapest allowed cost', () => {
    expect(SPIN_EXPECTED_PAYOUT / SPIN_MIN_COST).toBeLessThanOrEqual(0.9);
  });

  it('raises a too-cheap or broken admin price to the floor', () => {
    expect(effectiveSpinCost(0)).toBe(SPIN_MIN_COST);
    expect(effectiveSpinCost(-5)).toBe(SPIN_MIN_COST);
    expect(effectiveSpinCost(Number.NaN)).toBe(SPIN_MIN_COST);
    expect(effectiveSpinCost(50)).toBe(50);
  });
});

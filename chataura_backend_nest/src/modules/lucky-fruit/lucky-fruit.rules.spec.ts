import { LF_FRUITS, LF_ITEMS, betPayout, drawBonusFruits, istDay, readSettings, rtpByFruit, validWeights } from './lucky-fruit.rules';

describe('lucky fruit rules', () => {
  const s = readSettings({});
  it('default weights sum to 10000 and every fruit returns 94-96%', () => {
    expect(Object.values(s.weights).reduce((a, b) => a + b, 0)).toBe(10_000);
    for (const [, v] of Object.entries(rtpByFruit(s))) {
      expect(v).toBeGreaterThan(94);
      expect(v).toBeLessThan(96);
    }
  });
  it('ships off and ignores bad overrides', () => {
    expect(s.enabled).toBe(false);
    expect(readSettings({ lucky_fruit_weights: { orange: 5 } }).weights.orange).toBe(LF_ITEMS.orange.weight);
    expect(validWeights({ orange: 1 })).toBe(false);
  });
  it('bonus draw gives distinct fruits', () => {
    for (let i = 0; i < 50; i++) {
      const b = drawBonusFruits(3);
      expect(new Set(b).size).toBe(3);
      b.forEach((f) => expect(LF_FRUITS).toContain(f));
    }
  });
  it('pays winner full, lit fruit by bonus %, others nothing', () => {
    expect(betPayout('apple', 1000n, 'apple', [], 20)).toBe(10_000n);
    expect(betPayout('apple', 1000n, 'lucky', ['apple', 'mango'], 20)).toBe(2_000n);
    expect(betPayout('orange', 1000n, 'lucky', ['apple'], 20)).toBe(0n);
    expect(betPayout('lucky', 1000n, 'lucky', [], 20)).toBe(0n);
  });
  it('IST day rolls at 18:30 UTC', () => {
    expect(istDay(Date.UTC(2026, 10, 11, 18, 29))).toBe('2026-11-11');
    expect(istDay(Date.UTC(2026, 10, 11, 18, 31))).toBe('2026-11-12');
  });
});

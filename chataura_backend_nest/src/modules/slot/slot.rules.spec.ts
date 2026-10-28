import { PRESETS, buildStrip, evaluate, exactRtp, lineMultiplier, validBetLevels, WILD } from './slot.rules';

describe('slot rules', () => {
  it('strips hold exactly the preset counts', () => {
    for (const counts of Object.values(PRESETS)) {
      const strip = buildStrip(counts);
      expect(strip).toHaveLength(64);
      counts.forEach((c, s) => expect(strip.filter((x) => x === s)).toHaveLength(c));
    }
  });

  it('each preset returns its advertised RTP', () => {
    for (const [pct, counts] of Object.entries(PRESETS)) expect(exactRtp(counts) * 100).toBeCloseTo(Number(pct), 0);
  });

  it('lines: wild substitutes, cherry pair, mismatch', () => {
    expect(lineMultiplier(6, 6, 6)).toBe(100);
    expect(lineMultiplier(6, WILD, 6)).toBe(100);
    expect(lineMultiplier(WILD, WILD, WILD)).toBe(200);
    expect(lineMultiplier(WILD, WILD, 3)).toBe(8);
    expect(lineMultiplier(0, 0, 5)).toBe(1);
    expect(lineMultiplier(0, WILD, 5)).toBe(1);
    expect(lineMultiplier(WILD, WILD, 5 )).toBe(30);
    expect(lineMultiplier(0, 1, 0)).toBe(0);
    expect(lineMultiplier(1, 0, 0)).toBe(0);
  });

  it('pays every winning line on the bet split in 5', () => {
    // middle row three sevens, nothing else matching
    const grid = [[1, 6, 2], [3, 6, 4], [5, 6, 1]];
    const r = evaluate(grid, 100_000);
    expect(r.payout).toBe(20_000 * 100);
    expect(r.wins).toHaveLength(1);
  });

  it('bet levels', () => {
    expect(validBetLevels([10_000, 50_000])).toBe(true);
    expect(validBetLevels([50_000, 10_000])).toBe(false);
    expect(validBetLevels([7])).toBe(false);
  });
});

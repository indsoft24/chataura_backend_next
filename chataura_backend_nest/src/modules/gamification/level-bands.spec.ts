import { bandForXp, isSquaredSeed, LARAVEL_LEVEL_BANDS } from './level-bands';

describe('level bands', () => {
  it('treats 0 XP as the 0–99 band, not a hardcoded 100', () => {
    const band = bandForXp(0, [...LARAVEL_LEVEL_BANDS]);
    expect(band.level).toBe(0);
    expect(band.minXp).toBe(0);
    expect(band.maxXp).toBe(99);
    expect(band.xpProgressPct).toBe(0);
  });

  it('places 100 XP at the start of level 1', () => {
    const band = bandForXp(100, [...LARAVEL_LEVEL_BANDS]);
    expect(band.level).toBe(1);
    expect(band.minXp).toBe(100);
    expect(band.maxXp).toBe(299);
  });

  it('recognizes the old squared seed', () => {
    expect(
      isSquaredSeed([
        { level: 1, minXp: 0, maxXp: 99 },
        { level: 2, minXp: 100, maxXp: 399 },
      ]),
    ).toBe(true);
    expect(isSquaredSeed([...LARAVEL_LEVEL_BANDS])).toBe(false);
  });
});

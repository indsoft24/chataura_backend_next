import {
  GREEDY_ITEMS,
  LUCKY77_OPTIONS,
  lucky77ComboError,
  pickWeighted,
} from './game.constants';

function empiricalRtp(
  table: Record<string, { multiplier: number; weight: number }>,
  draws: number,
) {
  const counts: Record<string, number> = {};
  for (let i = 0; i < draws; i++) {
    const key = pickWeighted(table);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const totalWeight = Object.values(table).reduce((s, v) => s + v.weight, 0);
  let empirical = 0;
  let theoretical = 0;
  for (const [key, spec] of Object.entries(table)) {
    theoretical += (spec.weight / totalWeight) * spec.multiplier;
    empirical += ((counts[key] ?? 0) / draws) * spec.multiplier;
  }
  return { empirical, theoretical, counts };
}

describe('game RNG weights', () => {
  const DRAWS = 100_000;

  it('greedy RTP stays within expectation (statistical variance bound)', () => {
    const { empirical, theoretical } = empiricalRtp(GREEDY_ITEMS, DRAWS);
    const drift = Math.abs(empirical - theoretical) / theoretical;
    expect(drift).toBeLessThan(0.015);
  });

  it('lucky77 RTP stays within expectation (statistical variance bound)', () => {
    const { empirical, theoretical } = empiricalRtp(LUCKY77_OPTIONS, DRAWS);
    const drift = Math.abs(empirical - theoretical) / theoretical;
    expect(drift).toBeLessThan(0.015);
  });
});

describe('lucky77 odds', () => {
  it('77 lands about once every 11 rounds; fruits split the rest evenly', () => {
    const total = Object.values(LUCKY77_OPTIONS).reduce((s, o) => s + o.weight, 0);
    expect(LUCKY77_OPTIONS.lucky_77.weight / total).toBeCloseTo(0.09, 3);
    expect(LUCKY77_OPTIONS.watermelon.weight).toBe(LUCKY77_OPTIONS.plum.weight);
  });
});

describe('lucky77 bet combinations', () => {
  it.each([
    [[], 'watermelon'],
    [[], 'plum'],
    [[], 'lucky_77'],
    [['watermelon'], 'watermelon'],
    [['watermelon'], 'lucky_77'],
    [['lucky_77'], 'plum'],
    [['plum', 'lucky_77'], 'plum'],
    [['plum', 'lucky_77'], 'lucky_77'],
  ])('allows %j + %s', (existing, option) => {
    expect(lucky77ComboError(existing, option)).toBeNull();
  });

  it.each([
    [['watermelon'], 'plum'],
    [['plum'], 'watermelon'],
    [['watermelon', 'lucky_77'], 'plum'],
    [['lucky_77', 'plum'], 'watermelon'],
  ])('rejects %j + %s (both fruits)', (existing, option) => {
    expect(lucky77ComboError(existing, option)).toBe('FRUIT_CONFLICT');
  });
});

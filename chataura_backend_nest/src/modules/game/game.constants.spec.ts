import {
  GREEDY_ITEMS,
  LUCKY77_OPTIONS,
  lucky77ComboError,
  pickWeighted,
  withWeights,
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

describe('withWeights (database odds)', () => {
  const g = { carrot: 1975, tomato: 1975, corn: 1975, chilli: 1975, chicken: 2111, cow: 3800, crab: 6333, fish: 9500 };
  it('replaces weights, keeps multipliers', () => {
    const out = withWeights(GREEDY_ITEMS, { ...g, chicken: 100 });
    expect(out.chicken).toEqual({ multiplier: 45, weight: 100 });
    expect(out.cow.multiplier).toBe(25);
  });
  it.each([
    ['missing', undefined],
    ['array', []],
    ['one item short', { lucky_77: 1, watermelon: 1 }],
    ['extra item', { ...g, extra: 1 }],
    ['zero weight', { ...g, cow: 0 }],
    ['fraction', { ...g, cow: 1.5 }],
    ['string', { ...g, cow: '5' }],
  ])('ignores a bad entry: %s', (_n, bad) => {
    expect(withWeights(GREEDY_ITEMS, bad)).toBe(GREEDY_ITEMS);
  });
  it('lucky77 override works with its own keys', () => {
    const out = withWeights(LUCKY77_OPTIONS, { lucky_77: 11111, watermelon: 44444, plum: 44445 });
    expect(out.lucky_77.weight).toBe(11111);
    expect(out.lucky_77.multiplier).toBe(8);
  });
});

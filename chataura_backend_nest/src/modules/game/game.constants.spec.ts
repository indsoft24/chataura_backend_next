import { GREEDY_ITEMS, LUCKY77_OPTIONS, pickWeighted } from './game.constants';

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

  it('greedy RTP stays within 0.5% of weighted expectation', () => {
    const { empirical, theoretical } = empiricalRtp(GREEDY_ITEMS, DRAWS);
    const drift = Math.abs(empirical - theoretical) / theoretical;
    expect(drift).toBeLessThan(0.005);
  });

  it('lucky77 RTP stays within 0.5% of weighted expectation', () => {
    const { empirical, theoretical } = empiricalRtp(LUCKY77_OPTIONS, DRAWS);
    const drift = Math.abs(empirical - theoretical) / theoretical;
    expect(drift).toBeLessThan(0.005);
  });
});

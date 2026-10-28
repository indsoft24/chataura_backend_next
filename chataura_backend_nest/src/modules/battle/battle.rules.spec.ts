import { readBattleSettings, sideOfSeat, splitPayout, winnerSide } from './battle.rules';

describe('battle rules', () => {
  it('maps 4 columns to two teams', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 11].map(sideOfSeat)).toEqual([
      'red', 'red', 'blue', 'blue', 'red', 'red', 'blue', 'blue', 'blue',
    ]);
  });

  it('pays 15% evenly to winners and 2% to the initiator', () => {
    const p = splitPayout({
      red: 600n, blue: 400n, winnerPct: 15, initiatorPct: 2,
      initiatorId: 9n, winnerIds: [1n, 2n, 3n],
    });
    expect(p).toEqual([
      { userId: 1n, role: 'winner', amount: 50n },
      { userId: 2n, role: 'winner', amount: 50n },
      { userId: 3n, role: 'winner', amount: 50n },
      { userId: 9n, role: 'initiator', amount: 20n },
    ]);
  });

  it('pays nothing on a draw and no winner share without seated winners', () => {
    expect(winnerSide(5n, 5n)).toBeNull();
    expect(splitPayout({ red: 5n, blue: 5n, winnerPct: 15, initiatorPct: 2, initiatorId: 9n, winnerIds: [1n] })).toEqual([]);
    const p = splitPayout({ red: 1000n, blue: 0n, winnerPct: 15, initiatorPct: 2, initiatorId: 9n, winnerIds: [] });
    expect(p).toEqual([{ userId: 9n, role: 'initiator', amount: 20n }]);
  });

  it('never lets bad settings pay out more than the pool', () => {
    const s = readBattleSettings({ battle_winner_pct: 90, battle_initiator_pct: 50, battle_max_minutes: 1 });
    expect(s.winnerPct + s.initiatorPct).toBeLessThanOrEqual(100);
    expect(s.maxMinutes).toBeGreaterThanOrEqual(s.minMinutes);
    expect(s.enabled).toBe(false);
  });
});

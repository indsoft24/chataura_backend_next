import {
  DICE_REFRESH_WINDOW_MS,
  cooldownLeft,
  diceCommand,
  diceEvent,
  refreshError,
  rollDie,
} from './dice.rules';

describe('dice rules', () => {
  it('rolls 1–6 only', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 600; i++) seen.add(rollDie());
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('applies the 3 s cooldown', () => {
    const now = new Date('2026-10-27T10:00:03Z');
    expect(cooldownLeft(null, now)).toBe(0);
    expect(cooldownLeft(new Date('2026-10-27T10:00:01Z'), now)).toBe(1000);
    expect(cooldownLeft(new Date('2026-10-27T10:00:00Z'), now)).toBe(0);
  });

  it('allows re-rolls only for the owner, with SVIP, inside 10 s, within the count', () => {
    const at = new Date('2026-10-27T10:00:00Z');
    const roll = { userId: 7n, createdAt: at, refreshCount: 0 };
    const in5 = new Date(at.getTime() + 5000);
    expect(refreshError(roll, 7n, 2, in5)).toBeNull();
    expect(refreshError(roll, 8n, 2, in5)).toBe('NOT_YOUR_ROLL');
    expect(refreshError(roll, 7n, 0, in5)).toBe('SVIP_REQUIRED');
    expect(
      refreshError(
        roll,
        7n,
        2,
        new Date(at.getTime() + DICE_REFRESH_WINDOW_MS + 1),
      ),
    ).toBe('REFRESH_EXPIRED');
    expect(refreshError({ ...roll, refreshCount: 2 }, 7n, 2, in5)).toBe(
      'NO_REFRESHES_LEFT',
    );
  });

  it('builds the room event', () => {
    const at = new Date('2026-10-27T10:00:00Z');
    const e = diceEvent(
      {
        id: 5n,
        userId: 7n,
        value: 4,
        svipLevel: 1,
        refreshCount: 1,
        createdAt: at,
      },
      2,
    );
    expect(e).toEqual({
      roll_id: 5,
      user_id: 7,
      value: 4,
      svip_level: 1,
      refresh_count: 1,
      refreshes_left: 1,
      refresh_until: '2026-10-27T10:00:10.000Z',
    });
    expect(
      diceEvent(
        {
          id: 5n,
          userId: 7n,
          value: 4,
          svipLevel: 0,
          refreshCount: 0,
          createdAt: at,
        },
        0,
      ).refresh_until,
    ).toBeNull();
    expect(diceCommand(e).startsWith('CMD:DICE:{')).toBe(true);
  });
});

import {
  canRunMusicalChair,
  mchairCommand,
  mchairEvent,
  resolvePausedSeat,
} from './musical-chair.rules';

describe('musical chair rules', () => {
  const roles = { hostId: 1n, coHostId: 2n, staffAdminIds: [3n, 4n] };

  it('lets only host, co-host and staff admins run it', () => {
    for (const id of [1n, 2n, 3n, 4n]) expect(canRunMusicalChair(id, roles)).toBe(true);
    expect(canRunMusicalChair(9n, roles)).toBe(false);
    expect(canRunMusicalChair(9n, { hostId: null, coHostId: null, staffAdminIds: [] })).toBe(false);
  });

  const occ = [
    { seat: 5, userId: 50n },
    { seat: 1, userId: 10n },
    { seat: 3, userId: 30n },
  ];

  it('pins the requested seat when it is occupied', () => {
    expect(resolvePausedSeat(3, occ)).toEqual({ seat: 3, userId: 30n });
  });

  it('falls to the next occupied seat, wrapping, when the seat was vacated', () => {
    expect(resolvePausedSeat(4, occ)).toEqual({ seat: 5, userId: 50n });
    expect(resolvePausedSeat(6, occ)).toEqual({ seat: 1, userId: 10n });
  });

  it('returns null with nobody seated', () => {
    expect(resolvePausedSeat(1, [])).toBeNull();
  });

  it('builds the room command', () => {
    const ev = mchairEvent(
      { id: 7n, starterId: 1n, pausedSeat: 3, pausedUserId: 30n, version: 4, lastActionAt: new Date(1000) },
      'paused',
      new Date(2500),
    );
    expect(mchairCommand(ev)).toBe(
      'CMD:MCHAIR:{"session_id":7,"state":"paused","starter_id":1,"version":4,"paused_seat":3,"paused_user_id":30,"at_ms":1000,"now_ms":2500}',
    );
  });
});

import { AuthorityInput, resolveActingHost } from './room-authority';

const base = (over: Partial<AuthorityInput> = {}): AuthorityInput => ({
  hostId: 1n,
  coHostId: null,
  currentActingId: null,
  activeIds: new Set<string>(),
  adminIds: [],
  seats: [],
  maxSeats: 10,
  ...over,
});
const active = (...ids: number[]) => new Set(ids.map(String));

describe('resolveActingHost', () => {
  it('host present: nobody acts, whoever is around', () => {
    expect(
      resolveActingHost(
        base({ activeIds: active(1, 2, 3), coHostId: 2n, adminIds: [3n] }),
      ),
    ).toBeNull();
  });

  it('host away: the host-appointed co-host acts first', () => {
    expect(
      resolveActingHost(
        base({ activeIds: active(2, 3), coHostId: 2n, adminIds: [3n] }),
      ),
    ).toBe(2n);
  });

  it('host-appointed co-host reclaims from an acting admin when they return', () => {
    expect(
      resolveActingHost(
        base({
          activeIds: active(2, 3),
          coHostId: 2n,
          adminIds: [3n],
          currentActingId: 3n,
        }),
      ),
    ).toBe(2n);
  });

  it('no co-host present: earliest-appointed present admin acts', () => {
    expect(
      resolveActingHost(
        base({ activeIds: active(4, 5), coHostId: 2n, adminIds: [3n, 5n, 4n] }),
      ),
    ).toBe(5n);
  });

  it('an acting admin is not replaced by an earlier-appointed admin arriving later', () => {
    expect(
      resolveActingHost(
        base({
          activeIds: active(3, 5),
          adminIds: [3n, 5n],
          currentActingId: 5n,
        }),
      ),
    ).toBe(5n);
  });

  it('no co-host or admin: lowest seated member acts (seat 0 never counts)', () => {
    expect(
      resolveActingHost(
        base({
          activeIds: active(7, 8, 9),
          seats: [
            { seatIndex: 6, userId: 8n },
            { seatIndex: 2, userId: 7n },
            { seatIndex: 0, userId: 9n },
          ],
        }),
      ),
    ).toBe(7n);
  });

  it('seated candidates must be active and inside the room capacity', () => {
    expect(
      resolveActingHost(
        base({
          activeIds: active(8),
          maxSeats: 5,
          seats: [
            { seatIndex: 1, userId: 7n }, // left the room (orphan seat)
            { seatIndex: 6, userId: 9n }, // beyond capacity
            { seatIndex: 3, userId: 8n },
          ],
        }),
      ),
    ).toBe(8n);
  });

  it('an acting seated member keeps the role while in the room, even off a seat', () => {
    expect(
      resolveActingHost(
        base({
          activeIds: active(7, 8),
          currentActingId: 7n,
          seats: [{ seatIndex: 1, userId: 8n }],
        }),
      ),
    ).toBe(7n);
  });

  it('an admin arriving replaces an acting seated member', () => {
    expect(
      resolveActingHost(
        base({
          activeIds: active(3, 7),
          adminIds: [3n],
          currentActingId: 7n,
          seats: [{ seatIndex: 1, userId: 7n }],
        }),
      ),
    ).toBe(3n);
  });

  it('acting person who left is replaced by the next in order', () => {
    expect(
      resolveActingHost(
        base({
          activeIds: active(8),
          currentActingId: 7n,
          seats: [{ seatIndex: 4, userId: 8n }],
        }),
      ),
    ).toBe(8n);
  });

  it('nobody eligible: null (room keeps running without an acting host)', () => {
    expect(resolveActingHost(base({ activeIds: active(5) }))).toBeNull();
  });

  it('the host can never be chosen as acting host', () => {
    expect(
      resolveActingHost(
        base({
          activeIds: active(2),
          coHostId: 1n,
          adminIds: [1n],
          currentActingId: 1n,
        }),
      ),
    ).toBeNull();
  });
});

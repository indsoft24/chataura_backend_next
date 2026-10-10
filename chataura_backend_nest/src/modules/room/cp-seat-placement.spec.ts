import { pickCpSeat, sameRowNeighbours } from './cp-seat-placement';

const seats = (entries: Array<[number, string]>) => new Map<number, string>(entries);
const ranks = (entries: Array<[string, number]>) => new Map<string, number>(entries);

describe('sameRowNeighbours', () => {
  it('prefers the right neighbour and never wraps rows', () => {
    // 8 seats → 3 columns: rows [0,1,2] [3,4,5] [6,7]
    expect(sameRowNeighbours(0, 8)).toEqual([1]);
    expect(sameRowNeighbours(1, 8)).toEqual([2, 0]);
    expect(sameRowNeighbours(2, 8)).toEqual([1]);
    expect(sameRowNeighbours(3, 8)).toEqual([4]);
    expect(sameRowNeighbours(7, 8)).toEqual([6]);
  });

  it('returns nothing for out-of-range or invalid seats', () => {
    expect(sameRowNeighbours(-1, 8)).toEqual([]);
    expect(sameRowNeighbours(8, 8)).toEqual([]);
    expect(sameRowNeighbours(NaN, 8)).toEqual([]);
    expect(sameRowNeighbours(0, 1)).toEqual([]);
  });
});

describe('pickCpSeat', () => {
  it('keeps the request when the user has no partner', () => {
    expect(
      pickCpSeat({ occupant: seats([[0, 'host']]), partnerRank: ranks([]), me: 'me', requested: 5, maxSeats: 8 }),
    ).toEqual({ seatIndex: 5, cpAdjusted: false });
  });

  it('keeps the request when the partner is not seated', () => {
    expect(
      pickCpSeat({ occupant: seats([[0, 'host']]), partnerRank: ranks([['p', 0]]), me: 'me', requested: 5, maxSeats: 8 }),
    ).toEqual({ seatIndex: 5, cpAdjusted: false });
  });

  it('seats the host partner at seat 1 whatever seat was requested', () => {
    expect(
      pickCpSeat({ occupant: seats([[0, 'host']]), partnerRank: ranks([['host', 0]]), me: 'me', requested: 6, maxSeats: 8 }),
    ).toEqual({ seatIndex: 1, cpAdjusted: true });
  });

  it('moves beside a seated partner, right side first', () => {
    expect(
      pickCpSeat({ occupant: seats([[0, 'host'], [3, 'p']]), partnerRank: ranks([['p', 0]]), me: 'me', requested: 7, maxSeats: 8 }),
    ).toEqual({ seatIndex: 4, cpAdjusted: true });
  });

  it('uses the left neighbour when the right one is taken', () => {
    expect(
      pickCpSeat({
        occupant: seats([[0, 'host'], [4, 'p'], [5, 'x']]),
        partnerRank: ranks([['p', 0]]),
        me: 'me',
        requested: 7,
        maxSeats: 8,
      }),
    ).toEqual({ seatIndex: 3, cpAdjusted: true });
  });

  it('respects a requested seat that is already beside the partner', () => {
    expect(
      pickCpSeat({ occupant: seats([[0, 'host'], [4, 'p']]), partnerRank: ranks([['p', 0]]), me: 'me', requested: 3, maxSeats: 8 }),
    ).toEqual({ seatIndex: 3, cpAdjusted: false });
  });

  it('never hands out host seat 0 as a neighbour', () => {
    // Partner on seat 1: right neighbour 2 taken, left neighbour is seat 0 → keep request.
    expect(
      pickCpSeat({
        occupant: seats([[0, 'host'], [1, 'p'], [2, 'x']]),
        partnerRank: ranks([['p', 0]]),
        me: 'me',
        requested: 6,
        maxSeats: 8,
      }),
    ).toEqual({ seatIndex: 6, cpAdjusted: false });
  });

  it('falls back to the request when both neighbours are full', () => {
    expect(
      pickCpSeat({
        occupant: seats([[0, 'host'], [3, 'x'], [4, 'p'], [5, 'y']]),
        partnerRank: ranks([['p', 0]]),
        me: 'me',
        requested: 7,
        maxSeats: 8,
      }),
    ).toEqual({ seatIndex: 7, cpAdjusted: false });
  });

  it('prefers the CP partner over a BCP partner', () => {
    expect(
      pickCpSeat({
        occupant: seats([[0, 'host'], [3, 'bcp'], [6, 'cp']]),
        partnerRank: ranks([['cp', 0], ['bcp', 1]]),
        me: 'me',
        requested: 2,
        maxSeats: 8,
      }),
    ).toEqual({ seatIndex: 7, cpAdjusted: true });
  });

  it('handles a one-seat room without errors', () => {
    expect(
      pickCpSeat({ occupant: seats([[0, 'host']]), partnerRank: ranks([['host', 0]]), me: 'me', requested: 0, maxSeats: 1 }),
    ).toEqual({ seatIndex: 0, cpAdjusted: false });
  });

  it('ignores occupancy outside capacity', () => {
    expect(
      pickCpSeat({ occupant: seats([[12, 'p']]), partnerRank: ranks([['p', 0]]), me: 'me', requested: 2, maxSeats: 8 }),
    ).toEqual({ seatIndex: 2, cpAdjusted: false });
  });

  it('treats a seat the user already holds as free (max seats 20, 5 columns)', () => {
    expect(
      pickCpSeat({
        occupant: seats([[0, 'host'], [10, 'p'], [11, 'me']]),
        partnerRank: ranks([['p', 0]]),
        me: 'me',
        requested: 15,
        maxSeats: 20,
      }),
    ).toEqual({ seatIndex: 11, cpAdjusted: true });
  });
});

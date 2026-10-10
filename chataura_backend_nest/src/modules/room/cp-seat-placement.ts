/**
 * Pure CP/BCP seat placement rules (no DB) — mirrors the Android grid in CpSeatGlue.kt.
 */

/** Seat grid columns for a room capacity (Android PartyRoomFragment / CpSeatGlue span). */
export function seatGridColumns(maxSeats: number): number {
  if (maxSeats <= 4) return 2;
  if (maxSeats <= 9) return 3;
  if (maxSeats <= 16) return 4;
  return 5;
}

/** Same-row neighbours of [seat], right first (host at 0 → partner at 1). */
export function sameRowNeighbours(seat: number, maxSeats: number): number[] {
  if (!Number.isInteger(seat) || seat < 0 || seat >= maxSeats) return [];
  const cols = seatGridColumns(maxSeats);
  const col = seat % cols;
  const out: number[] = [];
  if (col < cols - 1 && seat + 1 < maxSeats) out.push(seat + 1);
  if (col > 0) out.push(seat - 1);
  return out;
}

export interface CpSeatInput {
  /** Live occupancy: seat index → user id (string). Seat 0 holds the host when present. */
  occupant: Map<number, string>;
  /** Partner user id → priority rank (0 = highest, e.g. CP before BCP). */
  partnerRank: Map<string, number>;
  /** User being seated. */
  me: string;
  requested: number;
  maxSeats: number;
}

export interface CpSeatPlacement {
  seatIndex: number;
  cpAdjusted: boolean;
}

/**
 * When a partner is seated, place [me] on a free same-row seat beside them; seat 0 is never
 * handed out. Highest-priority partner wins, ties go to the lowest seat. The requested seat is
 * kept when it is already beside the partner, or when no neighbour is free.
 */
export function pickCpSeat(input: CpSeatInput): CpSeatPlacement {
  const { occupant, partnerRank, me, requested, maxSeats } = input;
  const unchanged: CpSeatPlacement = { seatIndex: requested, cpAdjusted: false };
  if (partnerRank.size === 0) return unchanged;

  let anchor: { seat: number; rank: number } | null = null;
  for (const [seat, uid] of occupant) {
    if (seat < 0 || seat >= maxSeats || uid === me) continue;
    const rank = partnerRank.get(uid);
    if (rank === undefined) continue;
    if (!anchor || rank < anchor.rank || (rank === anchor.rank && seat < anchor.seat)) {
      anchor = { seat, rank };
    }
  }
  if (!anchor) return unchanged;

  const isFree = (seat: number) =>
    seat > 0 && seat < maxSeats && (!occupant.has(seat) || occupant.get(seat) === me);
  const neighbours = sameRowNeighbours(anchor.seat, maxSeats);
  if (neighbours.includes(requested) && isFree(requested)) return unchanged;
  const pick = neighbours.find(isFree);
  if (pick === undefined) return unchanged;
  return { seatIndex: pick, cpAdjusted: pick !== requested };
}

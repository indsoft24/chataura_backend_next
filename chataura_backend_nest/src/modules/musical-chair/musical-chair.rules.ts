export const MCHAIR_ENABLED_KEY = 'musical_chair_enabled';
/** A session with no action for this long is ended (the starter walked away). */
export const MCHAIR_IDLE_MS = 10 * 60_000;
/** Highlight needs at least this many seated members to be a game. */
export const MCHAIR_MIN_SEATED = 2;

export type SeatOccupant = { seat: number; userId: bigint };

export type RoomRoles = {
  hostId: bigint | null;
  coHostId: bigint | null;
  staffAdminIds: readonly bigint[];
};

/** Host (or owner), co-host or one of the room's staff admins. */
export function canRunMusicalChair(userId: bigint, roles: RoomRoles): boolean {
  return (
    roles.hostId === userId ||
    roles.coHostId === userId ||
    roles.staffAdminIds.some((id) => id === userId)
  );
}

/**
 * The seat to pin when the starter pauses. Their phone sends the seat it shows; if that seat was
 * vacated a moment ago, the next occupied seat (wrapping) is used so every phone stops together.
 */
export function resolvePausedSeat(
  requested: number,
  occupied: readonly SeatOccupant[],
): SeatOccupant | null {
  if (occupied.length === 0) return null;
  const sorted = [...occupied].sort((a, b) => a.seat - b.seat);
  return (
    sorted.find((o) => o.seat === requested) ??
    sorted.find((o) => o.seat > requested) ??
    sorted[0]
  );
}

export type MusicalChairEvent = {
  session_id: number;
  /** started | playing | paused | ended */
  state: string;
  starter_id: number;
  version: number;
  paused_seat: number | null;
  paused_user_id: number | null;
};

export function mchairEvent(
  s: {
    id: bigint;
    starterId: bigint;
    pausedSeat: number | null;
    pausedUserId: bigint | null;
    version: number;
  },
  state: string,
): MusicalChairEvent {
  return {
    session_id: Number(s.id),
    state,
    starter_id: Number(s.starterId),
    version: s.version,
    paused_seat: s.pausedSeat,
    paused_user_id: s.pausedUserId == null ? null : Number(s.pausedUserId),
  };
}

export function mchairCommand(event: MusicalChairEvent): string {
  return `CMD:MCHAIR:${JSON.stringify(event)}`;
}

import { createHash } from 'crypto';

/**
 * Live room state — the ONE document every client renders the room from
 * (Firestore `rooms/{roomId}/live/state`, written only by the server).
 *
 * Seat entries use the same field names as GET /rooms/:id/seats, so clients parse both alike.
 */
export type LiveSeat = {
  seat_index: number;
  user_id: number | null;
  display_id: string | null;
  agora_uid: number | null;
  display_name: string | null;
  avatar_url: string | null;
  is_muted: boolean;
  muted_by_user_id: number | null;
  is_locked: boolean;
  [extra: string]: unknown;
};

export type LiveRoomState = {
  room_id: string;
  display_id: string;
  ended: boolean;
  host_id: number | null;
  owner_id: number;
  /** The room's co-host as clients show it: the acting host while the host is away. */
  co_host_id: number | null;
  /** Holds the host's powers while the host is away (room-authority.ts); null otherwise. */
  acting_host_id: number | null;
  /** Host is an active member of the room. */
  host_present: boolean;
  admin_ids: number[];
  max_seats: number;
  seat_mode: string;
  theme_id: number | null;
  /** Active members (room_members.is_active) — the room's single viewer count. */
  online_count: number;
  seats: LiveSeat[];
};

export const LIVE_STATE_SCHEMA = 1;

/** Content hash (version excluded) — identical states are never re-published. */
export function stateHash(state: LiveRoomState): string {
  return createHash('sha1').update(JSON.stringify(state)).digest('hex');
}

/** Seats whose occupant / mute / lock changed between two published states. */
export function changedSeats(prev: LiveSeat[] | null, next: LiveSeat[]): LiveSeat[] {
  if (!prev) return [];
  const before = new Map(prev.map((s) => [s.seat_index, s]));
  const out: LiveSeat[] = [];
  for (const s of next) {
    const p = before.get(s.seat_index);
    if (
      !p ||
      p.user_id !== s.user_id ||
      p.is_muted !== s.is_muted ||
      p.muted_by_user_id !== s.muted_by_user_id ||
      p.is_locked !== s.is_locked
    ) {
      out.push(s);
    }
    before.delete(s.seat_index);
  }
  // Seats that disappeared (capacity reduced) become empty for old clients.
  for (const p of before.values()) {
    out.push({ ...p, user_id: null, agora_uid: null, is_muted: false, muted_by_user_id: null });
  }
  return out;
}

/**
 * Per-seat event in the JSON format released app versions already apply from room chat
 * (`{"event":"seat_updated","data":{…}}`), so old and new apps see the same seats while
 * users update. Written with origin=server.
 */
export function legacySeatEvent(seat: LiveSeat, version: number): string {
  return JSON.stringify({
    event: 'seat_updated',
    data: {
      seat_index: seat.seat_index,
      user_id: seat.user_id ?? 0,
      agora_uid: seat.agora_uid ?? 0,
      is_muted: seat.is_muted,
      muted_by_user_id: seat.muted_by_user_id,
      rtc_role: seat.user_id ? 'publisher' : 'audience',
      seats_version: version,
    },
  });
}

/**
 * Online status rules shared by every API that returns another user's presence.
 *
 * A user is online while their app keeps calling `POST /users/me/heartbeat` (every ~40 s) or a
 * room heartbeat (every ~15 s). `users.last_seen_at` is written at most once per
 * [LAST_SEEN_WRITE_INTERVAL_MS]; anyone not seen for [ONLINE_WINDOW_MS] is offline even before
 * the sweep flips `is_online` back to false.
 */
export const ONLINE_WINDOW_MS = 150_000;
export const LAST_SEEN_WRITE_INTERVAL_MS = 60_000;

export type PresenceSource = {
  isOnline?: boolean | null;
  lastSeenAt?: Date | null;
  showOnlineStatus?: boolean | null;
};

export function isEffectivelyOnline(
  user: PresenceSource | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!user?.isOnline || !user.lastSeenAt) return false;
  return now - user.lastSeenAt.getTime() <= ONLINE_WINDOW_MS;
}

/**
 * `is_online` / `last_seen_at` for API output. Users who turned off "show online status" always
 * appear offline with no last-seen time — except to themselves ([self]).
 */
export function presenceFields(
  user: PresenceSource | null | undefined,
  opts: { self?: boolean; now?: number } = {},
): { is_online: boolean; last_seen_at: string | null } {
  if (!user) return { is_online: false, last_seen_at: null };
  const hidden = !opts.self && user.showOnlineStatus === false;
  if (hidden) return { is_online: false, last_seen_at: null };
  return {
    is_online: isEffectivelyOnline(user, opts.now),
    last_seen_at: user.lastSeenAt?.toISOString() ?? null,
  };
}

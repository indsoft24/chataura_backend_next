/**
 * Room presence settings (admin panel → Settings, stored in admin_settings.extra_settings).
 * One definition of "in the room" for the whole system: a member is in the room while
 * room_members.is_active is true; the cleanup job sets it false after this many seconds
 * without a heartbeat (and frees their seat). Counts, member lists, seats and the room list
 * all derive from that single flag.
 */
export const ROOM_MEMBER_TIMEOUT_KEY = 'room_member_timeout_seconds';
export const ROOM_MEMBER_TIMEOUT_DEFAULT_S = 90;
export const ROOM_MEMBER_TIMEOUT_MIN_S = 45;
export const ROOM_MEMBER_TIMEOUT_MAX_S = 600;

export function readMemberTimeoutSeconds(extra: Record<string, unknown> | null | undefined): number {
  const raw = extra?.[ROOM_MEMBER_TIMEOUT_KEY];
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return ROOM_MEMBER_TIMEOUT_DEFAULT_S;
  return Math.min(ROOM_MEMBER_TIMEOUT_MAX_S, Math.max(ROOM_MEMBER_TIMEOUT_MIN_S, Math.floor(n)));
}

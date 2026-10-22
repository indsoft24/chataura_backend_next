/**
 * One account = one active phone, and a cap on new accounts per phone.
 * Pure, unit-tested; the services load the inputs.
 */

/** Stored on users.current_session_id after logout, so no older token matches anymore. */
export const LOGGED_OUT_SESSION = 'logged_out';

/** Default cap on accounts created from one phone (admin_settings.extra_settings.max_accounts_per_device). */
export const DEFAULT_MAX_ACCOUNTS_PER_DEVICE = 2;

/**
 * Does a token's session id still own the account?
 * A null current session means the user has not signed in since single-session went live:
 * tokens are accepted until that user's next login or refresh claims a session.
 */
export function sessionMatches(tokenSid: string | null | undefined, currentSid: string | null | undefined): boolean {
  if (currentSid == null) return true;
  return tokenSid != null && tokenSid === currentSid;
}

/** Admin panel tokens are a separate channel: admins can use the panel and their phone together. */
export const PANEL_SESSION = 'panel';

/** Token may be used by this account: the phone session must match; panel tokens need an admin. */
export function tokenAllowed(tokenSid: string | null | undefined, currentSid: string | null | undefined, role: string): boolean {
  if (tokenSid === PANEL_SESSION) return role === 'admin';
  return sessionMatches(tokenSid, currentSid);
}

/** Android ID / install id from the X-Device-Id header; anything odd is treated as "unknown". */
export function normalizeDeviceId(raw: unknown): string | null {
  const v = String(raw ?? '').trim();
  // "unknown" is the app's fallback when Android gives no id; it must not pool every such phone.
  return /^[A-Za-z0-9_-]{6,128}$/.test(v) && v.toLowerCase() !== 'unknown' ? v : null;
}

/** Normal-user accounts already made on this phone vs. the cap. */
export function canCreateAccount(existingAccounts: number, maxAccounts: number): boolean {
  return existingAccounts < Math.max(1, Math.floor(maxAccounts));
}

/** Only the first `max` normal accounts seen on a phone may log in on it. */
export function canUseDevice(userId: bigint, accountsByFirstSeen: bigint[], maxAccounts: number): boolean {
  const cap = Math.max(1, Math.floor(maxAccounts));
  const allowed = accountsByFirstSeen.slice(0, cap);
  return allowed.length < cap || allowed.includes(userId);
}

export function readMaxAccountsPerDevice(extra: Record<string, unknown> | null | undefined): number {
  const n = Number(extra?.max_accounts_per_device);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_MAX_ACCOUNTS_PER_DEVICE;
}

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

/** Panel sign-in code: valid 10 minutes, 5 guesses, one resend a minute (3 per code), 6 mails an hour per account. */
export const PANEL_OTP_TTL_SECONDS = 600;
export const PANEL_OTP_MAX_ATTEMPTS = 5;
export const PANEL_OTP_RESEND_AFTER_SECONDS = 60;
export const PANEL_OTP_MAX_RESENDS = 3;
export const PANEL_OTP_SENDS_PER_HOUR = 6;
/** Wrong passwords per email before the panel refuses further tries for 15 minutes. */
export const PANEL_PASSWORD_FAILS = 10;
/** A phone-less browser stays trusted this long (absolute, never extended) and an account keeps at most this many. */
export const TRUSTED_DEVICE_DAYS = 30;
export const TRUSTED_DEVICE_MAX = 5;
export const TRUSTED_COOKIE = 'ca_td';

export const DEFAULT_SUPERADMIN_OTP_EMAILS = ['chataura05@gmail.com', 'indsoft24@gmail.com'];

/** The superadmin's code goes to every address in the list; any other staff member's goes to their own. */
export function otpRecipients(isSuperadmin: boolean, ownEmail: string | null, configured: string | undefined): string[] {
  const list = isSuperadmin
    ? (configured ?? '').split(',').map((e) => e.trim().toLowerCase()).filter((e) => e.includes('@'))
    : [];
  const out = isSuperadmin ? (list.length ? list : DEFAULT_SUPERADMIN_OTP_EMAILS) : ownEmail ? [ownEmail.toLowerCase()] : [];
  return [...new Set(out)];
}

/** Hash of a code bound to its challenge, so a stolen store entry or another challenge's code is useless. */
export function hashCode(secret: string, challengeId: string, code: string): string {
  return createHmac('sha256', secret).update(`${challengeId}:${code}`).digest('hex');
}

export function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

export function newToken(): string {
  return randomBytes(32).toString('hex');
}

/** Trusted-device tokens are stored only as a hash. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function cookieValue(header: string | undefined, name: string): string | null {
  for (const part of String(header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim() || null;
  }
  return null;
}

/** j***n@gmail.com — shown on the code screen so the user knows where to look, without exposing the address. */
export function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  return `${name.slice(0, 2)}***@${domain}`;
}

/**
 * Chat input rules (pure, unit tested). Everything a client sends to 1-1 / group chat passes
 * through these before it is stored or delivered.
 */

export const MESSAGE_TEXT_MAX = 4000;
export const GROUP_NAME_MAX = 50;
export const GROUP_MAX_MEMBERS = 200;
export const CHAT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/** Types a client may send through `messages/send`. Gifts go through the paid gift endpoint. */
export const CLIENT_MESSAGE_TYPES = new Set(['text', 'image']);

export type GroupRole = 'owner' | 'admin' | 'member';

export function normalizeGroupRole(role: string | null | undefined): GroupRole {
  return role === 'owner' || role === 'admin' ? role : 'member';
}

/** Owner and admins manage the group (add / remove members, rename, change photo). */
export function canManageGroup(role: string | null | undefined): boolean {
  const r = normalizeGroupRole(role);
  return r === 'owner' || r === 'admin';
}

/**
 * Who may remove whom: the owner removes anyone but themselves; admins remove plain members.
 * Nobody removes the owner (the owner leaves or deletes the group instead).
 */
export function canRemoveMember(actorRole: string, targetRole: string): boolean {
  const actor = normalizeGroupRole(actorRole);
  const target = normalizeGroupRole(targetRole);
  if (target === 'owner') return false;
  if (actor === 'owner') return true;
  return actor === 'admin' && target === 'member';
}

export function cleanText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.replace(/\u0000/g, '').trim();
  return t.length ? t : null;
}

export function cleanGroupName(raw: unknown): string | null {
  const t = cleanText(raw);
  if (!t) return null;
  return t.slice(0, GROUP_NAME_MAX);
}

/**
 * Media must be a file we host (chat uploads / our storage) — never an arbitrary URL that would
 * make every recipient's phone fetch attacker content or leak their IP.
 */
export function isAllowedMediaUrl(url: string, allowedPrefixes: string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  const normalized = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  return allowedPrefixes.some((p) => p && normalized.startsWith(p.replace(/\/+$/, '') + '/'));
}

export type DetectedImage = { ext: 'jpg' | 'png' | 'webp' | 'gif'; mime: string };

/** Identify an image from its first bytes; the client's declared type / name are ignored. */
export function detectImage(head: Buffer): DetectedImage | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }
  if (
    head.length >= 8 &&
    head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { ext: 'png', mime: 'image/png' };
  }
  if (head.length >= 6 && /^GIF8[79]a$/.test(head.subarray(0, 6).toString('ascii'))) {
    return { ext: 'gif', mime: 'image/gif' };
  }
  if (
    head.length >= 12 &&
    head.subarray(0, 4).toString('ascii') === 'RIFF' &&
    head.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { ext: 'webp', mime: 'image/webp' };
  }
  return null;
}

/** Read-receipt statuses a client may report (never downgrade, never arbitrary strings). */
export const CLIENT_MESSAGE_STATUSES = new Set(['delivered', 'read']);

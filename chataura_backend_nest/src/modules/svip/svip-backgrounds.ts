/** Profile background slider rules (pure, so they can be tested without the database). */
export const MAX_PROFILE_BACKGROUNDS = 5;
export const MAX_BACKGROUND_BYTES = 6 * 1024 * 1024;
/** Images only: no videos, gifs or other files. */
export const BACKGROUND_URL_RE = /^[^\s]{1,500}\.(jpe?g|png|webp)$/i;

/**
 * The list a member may save: up to 5 links, no repeats, and every one already in their own list
 * (the server added it from its own upload), so nobody can point a background at another file.
 */
export function pickOwnBackgrounds(urls: unknown, mine: string[]): { list: string[] } | { error: 'BAD_REQUEST' | 'INVALID_MEDIA' } {
  if (!Array.isArray(urls) || urls.length > MAX_PROFILE_BACKGROUNDS || urls.some((u) => typeof u !== 'string')) {
    return { error: 'BAD_REQUEST' };
  }
  const own = new Set(mine);
  const list = [...new Set(urls as string[])];
  return list.every((u) => own.has(u)) ? { list } : { error: 'INVALID_MEDIA' };
}

/**
 * Level art the SVIP Center / My Items load from GCS (the app bundles only a small still of each as fallback).
 * Stored per level in svip_level_configs.art, e.g. {"medal": "https://storage.googleapis.com/chataura/svip/v1/svip1_medal.webp"}.
 * File convention: svip/v1/svip<level>_<key>.webp — see docs/SVIP_LEVEL_ART_GCS.md.
 */
export const SVIP_ART_KEYS = ['medal', 'frame', 'room_card', 'bubble'] as const;
export type SvipArtKey = (typeof SVIP_ART_KEYS)[number];

/** Only known keys with https URLs reach the app; anything else in the column is ignored. */
export function svipArtOf(raw: unknown): Partial<Record<SvipArtKey, string>> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Partial<Record<SvipArtKey, string>> = {};
  for (const key of SVIP_ART_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === 'string' && /^https:\/\/[^\s]+$/.test(v)) out[key] = v;
  }
  return Object.keys(out).length ? out : null;
}

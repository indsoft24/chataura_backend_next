import { normalizeGiftCategory } from './gift-category';

/**
 * Lucky gifts "start at N coins". N is an admin setting (extra_settings.lucky_gift_min_coins), read live on
 * every list / send, so changing it in the panel needs no build and no deploy. 0 = no floor.
 */
export const LUCKY_MIN_KEY = 'lucky_gift_min_coins';
export const LUCKY_MIN_DEFAULT = 2000;
export const LUCKY_MIN_MAX = 100_000_000;

export function readLuckyMinCoins(extra: Record<string, unknown> | null | undefined): number {
  const raw = extra?.[LUCKY_MIN_KEY];
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return LUCKY_MIN_DEFAULT;
  return Math.min(LUCKY_MIN_MAX, Math.max(0, Math.floor(n)));
}

type SettingsDb = { adminSetting?: { findUnique: (a: { where: { id: number }; select: { extraSettings: true } }) => Promise<{ extraSettings: unknown } | null> } };

export async function luckyMinCoins(db: SettingsDb): Promise<number> {
  if (!db.adminSetting) return 0; // a stand-in without settings (unit tests) has no floor
  const row = await db.adminSetting.findUnique({ where: { id: 1 }, select: { extraSettings: true } });
  return readLuckyMinCoins(row?.extraSettings as Record<string, unknown> | null);
}

/** A lucky gift cheaper than the floor is not on sale: hidden from the app and refused on send. */
export function belowLuckyMin(g: { category: string | null | undefined; coinCost: number }, min: number): boolean {
  return normalizeGiftCategory(g.category) === 'lucky' && g.coinCost < min;
}

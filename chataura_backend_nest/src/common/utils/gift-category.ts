export const GIFT_CATEGORIES = [
  'standard',
  'customize',
  'cp',
  'bcp',
] as const;

export type GiftCategory = (typeof GIFT_CATEGORIES)[number];

export function normalizeGiftCategory(
  raw: string | null | undefined,
): GiftCategory {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase();
  if ((GIFT_CATEGORIES as readonly string[]).includes(value)) {
    return value as GiftCategory;
  }
  return 'standard';
}

export function isGiftCategory(raw: string | null | undefined): boolean {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase();
  return (GIFT_CATEGORIES as readonly string[]).includes(value);
}

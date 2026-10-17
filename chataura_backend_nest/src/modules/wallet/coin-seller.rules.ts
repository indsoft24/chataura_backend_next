/**
 * Offline recharge (coin sellers on WhatsApp): number normalisation + template defaults.
 * Pure functions so they are unit-tested without a database.
 */

export const COIN_SELLER_TEMPLATE_KEY = 'coin_seller_message_template';

export const DEFAULT_COIN_SELLER_TEMPLATE = [
  'Hi, I want to buy {appName} coins.',
  'User ID: {userId}',
  'Name: {userName}',
  'Package: {coins} coins ({price})',
].join('\n');

/** National number rules (after the trunk "0" is removed) for the main markets. */
const KNOWN_COUNTRIES: { code: string; national: RegExp; example: string }[] = [
  { code: '880', national: /^1\d{9}$/, example: '+880 1712 345678' }, // Bangladesh
  { code: '971', national: /^\d{8,9}$/, example: '+971 50 123 4567' }, // UAE
  { code: '91', national: /^[6-9]\d{9}$/, example: '+91 98765 43210' }, // India
];

/**
 * Turns admin input like "+91 098765-43210" or "00971 50 123 4567" into wa.me digits
 * ("919876543210"). Throws a readable message when the number can't be right.
 */
export function normalizeWhatsappNumber(input: unknown): string {
  let raw = String(input ?? '').trim();
  if (raw.startsWith('00')) raw = '+' + raw.slice(2);
  if (!raw.startsWith('+')) {
    throw new Error('Number must start with the country code, e.g. +91, +880, +971');
  }
  if (/[^\d+\s\-().]/.test(raw) || raw.lastIndexOf('+') !== 0) {
    throw new Error('Number can only contain digits, spaces and dashes');
  }
  const digits = raw.replace(/\D/g, '');

  const known = KNOWN_COUNTRIES.find((c) => digits.startsWith(c.code));
  if (known) {
    const national = digits.slice(known.code.length).replace(/^0+/, '');
    if (!known.national.test(national)) {
      throw new Error(`Invalid +${known.code} number. Example: ${known.example}`);
    }
    return known.code + national;
  }

  // E.164: up to 15 digits; country codes never start with 0.
  if (!/^[1-9]\d{7,14}$/.test(digits)) {
    throw new Error('Invalid number: 8–15 digits including the country code');
  }
  return digits;
}

/** Country list from admin input: upper-case ISO codes, de-duplicated; "ALL"/empty = everyone. */
export function normalizeCountries(input: unknown): string[] {
  const list = Array.isArray(input) ? input : String(input ?? '').split(',');
  const codes = list
    .map((c) => String(c).trim().toUpperCase())
    .filter((c) => /^[A-Z]{2,3}$/.test(c));
  return codes.includes('ALL') ? [] : [...new Set(codes)];
}

export function readCoinSellerTemplate(extra: Record<string, unknown> | null | undefined): string {
  const t = extra?.[COIN_SELLER_TEMPLATE_KEY];
  return typeof t === 'string' && t.trim() ? t.slice(0, 1000) : DEFAULT_COIN_SELLER_TEMPLATE;
}

// ── Wholesale packages: only sellers (merchants, role = 'seller') may see or buy them ──

const WHOLESALE_AUDIENCES = new Set(['coin_seller', 'seller', 'reseller', 'authorized_seller']);

export function isWholesaleAudience(audience: string | null | undefined): boolean {
  return WHOLESALE_AUDIENCES.has(String(audience ?? '').trim().toLowerCase());
}

/** Retail list for everyone; the wholesale list is non-empty only for sellers. */
export function splitPackagesForViewer<T extends { audience: string }>(
  pkgs: T[],
  viewerRole: string | null | undefined,
): { viewer: 'coin_seller' | 'user'; packages: T[]; sellerPackages: T[] } {
  const isSeller = viewerRole === 'seller';
  return {
    viewer: isSeller ? 'coin_seller' : 'user',
    packages: pkgs.filter((p) => !isWholesaleAudience(p.audience)),
    sellerPackages: isSeller ? pkgs.filter((p) => isWholesaleAudience(p.audience)) : [],
  };
}

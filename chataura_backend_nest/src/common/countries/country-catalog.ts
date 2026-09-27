/**
 * ISO-3166-1 alpha-2 helpers for room Allowed Country + profile country.
 * Flag PNGs: flagcdn.com (w160 works well for circular avatars).
 */

const FLAG_CDN = 'https://flagcdn.com/w160';

/** Non-ISO aliases commonly seen in profile / legacy DB rows. */
const ALIASES: Record<string, string> = {
  INDIA: 'IN',
  AMERICA: 'US',
  USA: 'US',
  'UNITED STATES': 'US',
  UAE: 'AE',
  'UNITED ARAB EMIRATES': 'AE',
  PAK: 'PK',
  PAKISTAN: 'PK',
  'SAUDI ARABIA': 'SA',
  SAUDI: 'SA',
  '966': 'SA',
  BANGLADESH: 'BD',
  JAPAN: 'JP',
  NEPAL: 'NP',
  PHILIPPINES: 'PH',
  IRAQ: 'IQ',
  GLOBAL: 'ALL',
  WORLD: 'ALL',
  ANY: 'ALL',
};

export function normalizeCountryCode(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (upper === 'ALL' || upper === 'OTHER') return upper;
  if (/^[A-Z]{2}$/.test(upper)) return upper;
  return ALIASES[upper] ?? upper;
}

export function flagUrlForCode(code: string | null | undefined): string | null {
  const c = normalizeCountryCode(code);
  if (!c || c === 'ALL') return null;
  if (c === 'OTHER') {
    // Neutral placeholder (UN) when host picks "Other".
    return `${FLAG_CDN}/un.png`;
  }
  return `${FLAG_CDN}/${c.toLowerCase()}.png`;
}

export function resolveFlagUrl(
  code: string | null | undefined,
  storedUrl?: string | null,
): string | null {
  const stored = (storedUrl ?? '').trim();
  if (stored) return stored;
  return flagUrlForCode(code);
}

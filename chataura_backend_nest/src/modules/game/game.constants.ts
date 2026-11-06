export const BETTING_SECONDS = 30;

export const GREEDY_ITEMS: Record<
  string,
  { multiplier: number; weight: number }
> = {
  chicken: { multiplier: 45, weight: 200 },
  cow: { multiplier: 25, weight: 350 },
  crab: { multiplier: 15, weight: 600 },
  fish: { multiplier: 10, weight: 950 },
  carrot: { multiplier: 5, weight: 1975 },
  tomato: { multiplier: 5, weight: 1975 },
  corn: { multiplier: 5, weight: 1975 },
  chilli: { multiplier: 5, weight: 1975 },
};

export const GREEDY_SALAD = ['carrot', 'tomato', 'corn', 'chilli'];
export const GREEDY_FEAST = ['chicken', 'cow', 'crab', 'fish'];
export const GREEDY_MIN = 10_000;
export const GREEDY_MAX = 10_000_000;

export const LUCKY77_OPTIONS: Record<
  string,
  { multiplier: number; weight: number }
> = {
  // 77 is the rare big win: ~9% of rounds (about 1 in 11). Fruits share the rest.
  lucky_77: { multiplier: 8, weight: 900 },
  watermelon: { multiplier: 2, weight: 4550 },
  plum: { multiplier: 2, weight: 4550 },
};

/** Even-money options; a user may back at most one of them per round. */
export const LUCKY77_FRUITS: readonly string[] = ['watermelon', 'plum'];

/**
 * Allowed per-round combinations: a single fruit, lucky_77, or one fruit + lucky_77.
 * Backing both fruits hedges the even-money options (88% chance of a return) and
 * was being exploited, so it is rejected. Returns an error code, or null if allowed.
 */
export function lucky77ComboError(
  existingOptions: Iterable<string>,
  option: string,
): 'FRUIT_CONFLICT' | null {
  const options = new Set(existingOptions);
  options.add(option);
  let fruits = 0;
  for (const o of options) if (LUCKY77_FRUITS.includes(o)) fruits++;
  return fruits > 1 ? 'FRUIT_CONFLICT' : null;
}

export const LUCKY77_MIN = 50_000;
export const LUCKY77_MAX = 10_000_000;

export function pickWeighted(
  weights: Record<string, { weight: number }>,
): string {
  const entries = Object.entries(weights);
  const total = entries.reduce((s, [, v]) => s + v.weight, 0);
  let roll = Math.floor(Math.random() * total);
  for (const [key, v] of entries) {
    roll -= v.weight;
    if (roll < 0) return key;
  }
  return entries[0][0];
}

/** admin_settings.extra_settings keys: { item: weight } for every item of the game. */
export const GAME_WEIGHT_KEYS = { greedy: 'greedy_weights', lucky77: 'lucky77_weights' } as const;

/**
 * Built-in odds with the weights replaced by the database ones. Multipliers never change (the app shows them).
 * Anything not exactly "every item, weight a whole number 1..10,000,000" is ignored, so a bad entry can't break a round.
 */
export function withWeights<T extends Record<string, { multiplier: number; weight: number }>>(
  base: T,
  override: unknown,
): T {
  if (!override || typeof override !== 'object' || Array.isArray(override)) return base;
  const o = override as Record<string, unknown>;
  const keys = Object.keys(base);
  if (Object.keys(o).length !== keys.length) return base;
  const out: Record<string, { multiplier: number; weight: number }> = {};
  for (const k of keys) {
    const w = o[k];
    if (typeof w !== 'number' || !Number.isInteger(w) || w < 1 || w > 10_000_000) return base;
    out[k] = { multiplier: base[k].multiplier, weight: w };
  }
  return out as T;
}

export function secondsRemaining(endsAt: Date): number {
  return Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / 1000));
}

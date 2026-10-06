export const BETTING_SECONDS = 20;

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
  lucky_77: { multiplier: 8, weight: 1200 },
  watermelon: { multiplier: 2, weight: 4400 },
  plum: { multiplier: 2, weight: 4400 },
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

export function secondsRemaining(endsAt: Date): number {
  return Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / 1000));
}

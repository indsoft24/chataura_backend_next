/** Lucky Slots: pure rules (symbols, reel strips, paylines, payout, settings). The phone never sees these tables. */
export const SLOT_KEYS = {
  enabled: 'slot_enabled',
  rtpPreset: 'slot_rtp_preset',
  betLevels: 'slot_bet_levels',
  bigWinX: 'slot_big_win_x',
} as const;

/** Symbol ids are what the phone receives in the grid: 0 cherry … 7 wild. */
export const WILD = 7;
const PAY3 = [2, 3, 5, 8, 15, 30, 100, 200];
/** Cherry on the first two reels (wild may stand in for one) with no third match pays 1x. */
const CHERRY_PAIR = 1;
export const REEL_STOPS = 64;
export const LINES: [number, number][][] = [
  [[0, 1], [1, 1], [2, 1]],
  [[0, 0], [1, 0], [2, 0]],
  [[0, 2], [1, 2], [2, 2]],
  [[0, 0], [1, 1], [2, 2]],
  [[0, 2], [1, 1], [2, 0]],
];

/** Reel symbol counts per stop table (sum 64), tuned so `exactRtp` is 90 / 94 / 96 %. */
export const PRESETS: Record<number, number[]> = {
  90: [10, 14, 13, 10, 4, 4, 3, 6],
  94: [8, 13, 13, 7, 5, 7, 7, 4],
  96: [9, 11, 13, 10, 7, 5, 3, 6],
};

export type SlotSettings = { enabled: boolean; rtpPreset: 90 | 94 | 96; betLevels: number[]; bigWinX: number };
export const SLOT_DEFAULTS: SlotSettings = {
  enabled: false,
  rtpPreset: 94,
  betLevels: [10_000, 50_000, 100_000, 500_000, 1_000_000, 5_000_000],
  bigWinX: 10,
};

/** Bet levels must split evenly over the 5 lines, so every payout is a whole number of coins. */
export function validBetLevels(v: unknown): v is number[] {
  return (
    Array.isArray(v) &&
    v.length >= 1 &&
    v.length <= 8 &&
    v.every((n, i) => Number.isSafeInteger(n) && n > 0 && n % 5 === 0 && (i === 0 || n > v[i - 1]))
  );
}

export function readSlotSettings(extra: Record<string, unknown> | null | undefined): SlotSettings {
  const e = extra ?? {};
  const preset = Number(e[SLOT_KEYS.rtpPreset]);
  const bigWinX = Number(e[SLOT_KEYS.bigWinX]);
  return {
    enabled: e[SLOT_KEYS.enabled] === true,
    rtpPreset: (preset in PRESETS ? preset : SLOT_DEFAULTS.rtpPreset) as SlotSettings['rtpPreset'],
    betLevels: validBetLevels(e[SLOT_KEYS.betLevels]) ? (e[SLOT_KEYS.betLevels] as number[]) : SLOT_DEFAULTS.betLevels,
    bigWinX: Number.isFinite(bigWinX) && bigWinX >= 1 && bigWinX <= 1000 ? Math.floor(bigWinX) : SLOT_DEFAULTS.bigWinX,
  };
}

export function slotSettingsForApi(s: SlotSettings) {
  return {
    [SLOT_KEYS.enabled]: s.enabled,
    [SLOT_KEYS.rtpPreset]: s.rtpPreset,
    [SLOT_KEYS.betLevels]: s.betLevels,
    [SLOT_KEYS.bigWinX]: s.bigWinX,
  };
}

/** Deterministic strip: symbols spread as evenly as the counts allow (no clumps of one symbol). */
export function buildStrip(counts: number[]): number[] {
  const left = [...counts];
  const strip: number[] = [];
  for (let i = 0; i < REEL_STOPS; i++) {
    let best = 0;
    for (let s = 1; s < left.length; s++) if (left[s] > left[best] || (left[s] === left[best] && s > best && strip[i - 1] === best)) best = s;
    if (best === strip[i - 1]) {
      const alt = left.findIndex((c, s) => s !== best && c > 0 && c >= left[best] - 1);
      if (alt >= 0 && left[alt] > 0) best = alt;
    }
    strip.push(best);
    left[best]--;
  }
  return strip;
}

/** Three visible rows (top, middle, bottom) of each reel for the given stop positions. */
export function gridFromStops(strip: number[], stops: [number, number, number]): number[][] {
  return stops.map((p) => [0, 1, 2].map((r) => strip[(p + r - 1 + REEL_STOPS) % REEL_STOPS]));
}

/** Payout multiplier (× line bet) of one line of three symbols. Wild substitutes for anything. */
export function lineMultiplier(a: number, b: number, c: number): number {
  const real = [a, b, c].filter((x) => x !== WILD);
  if (real.length === 0) return PAY3[WILD];
  if (real.every((x) => x === real[0])) return PAY3[real[0]];
  const isCherryOrWild = (x: number) => x === 0 || x === WILD;
  if (isCherryOrWild(a) && isCherryOrWild(b) && (a === 0 || b === 0)) return CHERRY_PAIR;
  return 0;
}

export type LineWin = { line: number; symbol: number; mult: number };

/** `grid[reel][row]`. lineBet = bet / 5. */
export function evaluate(grid: number[][], bet: number) {
  const lineBet = bet / LINES.length;
  const wins: LineWin[] = [];
  LINES.forEach((cells, i) => {
    const [a, b, c] = cells.map(([reel, row]) => grid[reel][row]);
    const mult = lineMultiplier(a, b, c);
    if (mult > 0) wins.push({ line: i + 1, symbol: [a, b, c].find((x) => x !== WILD) ?? WILD, mult });
  });
  return { wins, payout: wins.reduce((t, w) => t + w.mult * lineBet, 0) };
}

/** Exact theoretical return to player of a preset: every stop combination, all 5 lines. */
export function exactRtp(counts: number[]): number {
  const strip = buildStrip(counts);
  let total = 0;
  for (let x = 0; x < REEL_STOPS; x++)
    for (let y = 0; y < REEL_STOPS; y++)
      for (let z = 0; z < REEL_STOPS; z++) total += evaluate(gridFromStops(strip, [x, y, z]), 5).payout;
  return total / REEL_STOPS ** 3 / 5;
}

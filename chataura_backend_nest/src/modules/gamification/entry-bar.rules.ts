/**
 * One entry-bar rule for every caller: who may wear a bar, and what the room sees when its
 * wearer joins. Pure (unit-tested); services load the rows.
 *
 * Adding a bar (another SVIP level, a level reward) is a catalog row — no code change here.
 */
import {
  catalogClientFields,
  normalizeFrameComposite,
} from '../../common/utils/catalog-media';

export type EntryBarRow = {
  id: bigint;
  name: string;
  levelRequired: number;
  svipLevel: number;
  imageUrl: string | null;
  animationUrl: string | null;
  compositeMode: string;
  isActive: boolean;
  /** Coins to buy it for a period; 0 / absent = not for sale. */
  coinCost?: bigint;
};

/**
 * SVIP bars need SVIP N or higher. Other bars need the user level, or a purchase that has not
 * ended (`paidUntil`, the end of the user's purchase of THIS bar).
 */
export function canWearEntryBar(
  bar: EntryBarRow,
  user: { level: number; svipLevel: number; paidUntil?: Date | null },
  now: Date = new Date(),
): boolean {
  if (!bar.isActive) return false;
  if (bar.svipLevel > 0) return user.svipLevel >= bar.svipLevel;
  if (user.level >= bar.levelRequired) return true;
  return !!user.paidUntil && user.paidUntil.getTime() > now.getTime();
}

export const ENTRY_BAR_SETTING_KEYS = {
  periodDays: 'entry_bar_period_days',
  renewPct: 'entry_bar_renew_pct',
  graceDays: 'entry_bar_renew_grace_days',
} as const;

/** Defaults confirmed 2026-10-26: 30 days, renew at 20 %, 3 days to renew after the end. */
export const ENTRY_BAR_DEFAULTS = { periodDays: 30, renewPct: 20, graceDays: 3 };

export type EntryBarSettings = typeof ENTRY_BAR_DEFAULTS;

const intIn = (v: unknown, def: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : def;
};

export function entryBarSettings(extra: unknown): EntryBarSettings {
  const e = (extra && typeof extra === 'object' ? extra : {}) as Record<string, unknown>;
  return {
    periodDays: intIn(e[ENTRY_BAR_SETTING_KEYS.periodDays], ENTRY_BAR_DEFAULTS.periodDays, 1, 365),
    renewPct: intIn(e[ENTRY_BAR_SETTING_KEYS.renewPct], ENTRY_BAR_DEFAULTS.renewPct, 0, 100),
    graceDays: intIn(e[ENTRY_BAR_SETTING_KEYS.graceDays], ENTRY_BAR_DEFAULTS.graceDays, 0, 30),
  };
}

export type EntryBarOffer =
  | { action: null }
  | { action: 'buy' | 'renew'; price: bigint; newExpiry: Date };

const DAY_MS = 86_400_000;

/**
 * What the user can do with a bar right now. Nothing when it is not for sale or the level already
 * unlocks it. Buy = full price for a fresh period. Renew (while bought, or up to the grace days
 * after it ended) = renew_pct of the price, adding a period to the current end. Past the grace: buy again.
 */
export function entryBarOffer(
  bar: Pick<EntryBarRow, 'coinCost' | 'levelRequired' | 'svipLevel' | 'isActive'>,
  userLevel: number,
  ownedUntil: Date | null,
  s: EntryBarSettings,
  now: Date,
): EntryBarOffer {
  const cost = bar.coinCost ?? 0n;
  if (!bar.isActive || bar.svipLevel > 0 || cost <= 0n || userLevel >= bar.levelRequired) {
    return { action: null };
  }
  const period = s.periodDays * DAY_MS;
  if (ownedUntil && now.getTime() <= ownedUntil.getTime() + s.graceDays * DAY_MS) {
    return {
      action: 'renew',
      price: (cost * BigInt(s.renewPct)) / 100n,
      newExpiry: new Date(ownedUntil.getTime() + period),
    };
  }
  return { action: 'buy', price: cost, newExpiry: new Date(now.getTime() + period) };
}

/**
 * Media contract shared with gifts and frames, plus `overlay`: the video can be drawn full
 * screen over the room. MP4 (H.264) has no transparency, so only with "screen" blend (black
 * drops out); WebM can carry its own alpha. Other bars keep the old pill-only entrance.
 */
export function entryBarMedia(bar: EntryBarRow) {
  const media = catalogClientFields(bar.imageUrl, bar.animationUrl);
  const composite = normalizeFrameComposite(bar.compositeMode);
  const overlay =
    media.media_type === 'video' &&
    (composite === 'screen' || /\.webm(\?|#|$)/i.test(media.animation_url ?? ''));
  return { id: Number(bar.id), name: bar.name, ...media, composite, overlay };
}

/**
 * The bar other users see for this person. Empty when the query did not load the bar (so the
 * app learns nothing), `entry_bar_id: 0` when they wear none or may no longer wear it.
 */
export function wornEntryBarFields(
  user: {
    level: number;
    selectedEntryBar?: EntryBarRow | null;
    selectedEntryBarPaidUntil?: Date | null;
  },
  svipLevel: number,
) {
  if (user.selectedEntryBar === undefined) return {};
  const bar = user.selectedEntryBar;
  const shown =
    bar &&
    canWearEntryBar(bar, {
      level: user.level,
      svipLevel,
      paidUntil: user.selectedEntryBarPaidUntil,
    })
      ? entryBarMedia(bar)
      : null;
  return { entry_bar_id: shown?.id ?? 0, entry_bar: shown };
}

/** Order for lists and for the bar SVIP wears by default: fixed, so repeated calls agree. */
export const ENTRY_BAR_ORDER = [
  { sortOrder: 'asc' as const },
  { id: 'asc' as const },
];

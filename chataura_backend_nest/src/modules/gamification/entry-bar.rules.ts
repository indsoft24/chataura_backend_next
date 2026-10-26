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
};

/** SVIP bars need SVIP N or higher; other bars need the user level. */
export function canWearEntryBar(
  bar: EntryBarRow,
  user: { level: number; svipLevel: number },
): boolean {
  if (!bar.isActive) return false;
  return bar.svipLevel > 0
    ? user.svipLevel >= bar.svipLevel
    : user.level >= bar.levelRequired;
}

/** Media contract shared with gifts and frames (`media_type` "video" = full-screen entrance). */
export function entryBarMedia(bar: EntryBarRow) {
  return {
    id: Number(bar.id),
    name: bar.name,
    ...catalogClientFields(bar.imageUrl, bar.animationUrl),
    composite: normalizeFrameComposite(bar.compositeMode),
  };
}

/**
 * The bar other users see for this person. Empty when the query did not load the bar (so the
 * app learns nothing), `entry_bar_id: 0` when they wear none or may no longer wear it.
 */
export function wornEntryBarFields(
  user: { level: number; selectedEntryBar?: EntryBarRow | null },
  svipLevel: number,
) {
  if (user.selectedEntryBar === undefined) return {};
  const bar = user.selectedEntryBar;
  const shown =
    bar && canWearEntryBar(bar, { level: user.level, svipLevel })
      ? entryBarMedia(bar)
      : null;
  return { entry_bar_id: shown?.id ?? 0, entry_bar: shown };
}

/** Order for lists and for the bar SVIP wears by default: fixed, so repeated calls agree. */
export const ENTRY_BAR_ORDER = [
  { sortOrder: 'asc' as const },
  { id: 'asc' as const },
];

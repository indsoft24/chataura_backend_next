/**
 * Reward history: which records count as a reward, how they are labelled, and the cursor.
 *
 * Coin / gem rewards come from the wallet ledger (`coin_transactions`) by type. Rocket rewards
 * come from `rocket_rewards` instead — it holds the XP and frame too, and a winner with no coin
 * share has no ledger row at all — so `ROCKET_REWARD` ledger rows are never read here.
 */

export const REWARD_CATEGORIES = [
  'rooms',
  'rocket',
  'bonuses',
  'games',
  'referrals',
] as const;
export type RewardCategory = (typeof REWARD_CATEGORIES)[number];

/** Ledger reward types → category and the title shown for them. */
export const LEDGER_REWARD_TYPES: Record<
  string,
  { category: Exclude<RewardCategory, 'rocket'>; title: string }
> = {
  ROOM_REWARD: { category: 'rooms', title: 'Room level reward' },
  PARTY_TIER: { category: 'rooms', title: 'Party room stay bonus' },
  PARTY_GEMS: { category: 'rooms', title: 'Party room stay bonus' },
  SPIN_WIN: { category: 'bonuses', title: 'Daily spin win' },
  BONUS_ADMOB: { category: 'bonuses', title: 'Ad reward' },
  BONUS_GAME: { category: 'bonuses', title: 'Game bonus' },
  BONUS_STREAK: { category: 'bonuses', title: 'Login streak bonus' },
  LUCKY_GIFT_REBATE: { category: 'bonuses', title: 'Lucky gift rebate' },
  GAME_GREEDY_WIN: { category: 'games', title: 'Greedy win' },
  GAME_LUCKY77_WIN: { category: 'games', title: 'Lucky 77 win' },
  REFERRAL_REFEREE: { category: 'referrals', title: 'Referral join bonus' },
  REFERRAL_REFERRER: { category: 'referrals', title: 'Referral invite bonus' },
  REFERRAL_MILESTONE: { category: 'referrals', title: 'Referral milestone' },
};

export const ROCKET_TITLE = 'Rocket reward';

export function isRewardCategory(v: unknown): v is RewardCategory {
  return (
    typeof v === 'string' &&
    (REWARD_CATEGORIES as readonly string[]).includes(v)
  );
}

/** Ledger types to read for [category] (all when null; none for rocket). */
export function ledgerTypesFor(category: RewardCategory | null): string[] {
  return Object.entries(LEDGER_REWARD_TYPES)
    .filter(([, v]) => category == null || v.category === category)
    .map(([type]) => type);
}

export function includesRocket(category: RewardCategory | null): boolean {
  return category == null || category === 'rocket';
}

/**
 * Rows from both sources are ordered by (created_at DESC, source DESC, id DESC); the cursor is
 * the last row's key. created_at travels as Postgres text so microseconds survive the trip.
 */
export const SOURCE_LEDGER = 0;
export const SOURCE_ROCKET = 1;

export type RewardCursor = { at: string; src: number; id: string };

export function encodeCursor(c: RewardCursor): string {
  return Buffer.from(JSON.stringify([c.at, c.src, c.id])).toString('base64url');
}

/** Null for a missing or malformed cursor (treated as the first page). */
export function decodeCursor(
  raw: string | undefined | null,
): RewardCursor | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    );
    if (!Array.isArray(v) || v.length !== 3) return null;
    const [at, src, id] = v as unknown[];
    if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null;
    if (src !== SOURCE_LEDGER && src !== SOURCE_ROCKET) return null;
    if (typeof id !== 'string' || !/^\d{1,19}$/.test(id)) return null;
    return { at, src, id };
  } catch {
    return null;
  }
}

/**
 * How rows of source [src] at exactly the cursor's created_at compare with the cursor:
 * 'all' — every such row comes after it, 'none' — none do, 'lower_id' — only lower ids.
 */
export function sameTimeRule(
  src: number,
  cursor: RewardCursor,
): 'all' | 'none' | 'lower_id' {
  if (src < cursor.src) return 'all';
  if (src > cursor.src) return 'none';
  return 'lower_id';
}

type Meta = Record<string, unknown> | null;

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/** One short detail line for a ledger reward, built only from what the record holds. */
export function ledgerSubtitle(
  type: string,
  title: string | null,
  meta: Meta,
  extra: { roomName?: string | null; minutes?: number | null },
): string | null {
  const parts: string[] = [];
  const t = title ?? '';
  switch (type) {
    case 'ROOM_REWARD': {
      const level = num(meta?.level);
      if (level != null) parts.push(`Level ${level}`);
      if (meta?.role === 'owner') parts.push('Room owner');
      const rank = num(meta?.rank);
      if (meta?.role === 'partner' && rank != null)
        parts.push(`Top supporter #${rank}`);
      break;
    }
    case 'PARTY_TIER':
    case 'PARTY_GEMS':
      if (extra.minutes != null) parts.push(`Stayed ${extra.minutes} min`);
      break;
    case 'SPIN_WIN':
      pushSuffix(parts, t, 'Spin win ');
      break;
    case 'BONUS_STREAK':
      pushSuffix(parts, t, 'Streak ', true);
      break;
    case 'LUCKY_GIFT_REBATE': {
      const pct = num(meta?.pct);
      if (pct != null) parts.push(`${pct}% back`);
      break;
    }
    case 'GAME_GREEDY_WIN':
      pushSuffix(parts, t, 'Greedy win ', false, 'Winner: ');
      break;
    case 'GAME_LUCKY77_WIN':
      pushSuffix(parts, t, 'Lucky77 win ', false, 'Winner: ');
      break;
  }
  if (extra.roomName) parts.unshift(extra.roomName);
  return parts.length ? parts.join(' · ') : null;
}

function pushSuffix(
  parts: string[],
  title: string,
  prefix: string,
  keepPrefix = false,
  label = '',
) {
  if (!title.startsWith(prefix)) return;
  const rest = title.slice(prefix.length).trim();
  if (!rest) return;
  parts.push(keepPrefix ? `${prefix.trim()} ${rest}` : `${label}${rest}`);
}

export function rocketSubtitle(
  roomName: string | null,
  rank: number | null,
  lucky = false,
): string | null {
  const parts: string[] = [];
  if (roomName) parts.push(roomName);
  if (lucky) parts.push('Lucky winner');
  else if (rank != null) parts.push(`Rank #${rank}`);
  return parts.length ? parts.join(' · ') : null;
}

/** Start of "today" and "this month" for a client UTC offset (minutes, e.g. 330 for IST). */
export function periodStarts(
  now: Date,
  tzOffsetMinutes: number,
): { today: Date; month: Date } {
  const offsetMs = tzOffsetMinutes * 60_000;
  const local = new Date(now.getTime() + offsetMs);
  const today = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
  );
  const month = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1);
  return {
    today: new Date(today - offsetMs),
    month: new Date(month - offsetMs),
  };
}

/** Client offset in minutes, clamped to real time zones; IST when missing or invalid. */
export function parseTzOffset(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 330;
  return Math.max(-720, Math.min(840, Math.trunc(n)));
}

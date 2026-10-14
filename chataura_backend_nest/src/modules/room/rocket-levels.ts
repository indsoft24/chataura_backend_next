/**
 * Rocket ladder rules (pure, unit-tested). A room climbs LV1 → LVmax; after the top level it
 * restarts at the first level with zero progress. The whole ladder resets daily at
 * reset_hour in reset_timezone (default 04:00 Asia/Kolkata).
 */

export type ExpiryMode = 'RESET_PROGRESS' | 'RESET_CYCLE';

/** Frozen per-event copy of a level + campaign rules (stored in rocket_events.config_snapshot). */
export type RocketLevelSnapshot = {
  level: number;
  name: string;
  threshold: number;
  reward_pool_percentage: number;
  max_winners: number;
  rules: number[];
  frame_id: number | null;
  frame_winners: number;
  frame_days: number;
  xp_rate: number;
  min_xp: number;
  theme_color: string;
  visual_tier: number;
  launch_asset_key: string | null;
  station_asset_key: string | null;
  badge_asset_key: string | null;
  min_contribution: number;
  /** % of people present in the room (excluding top winners) drawn for lucky coins; 0 = off. */
  lucky_audience_percent?: number;
  /** % of accumulated coins shared among lucky winners. */
  lucky_pool_percentage?: number;
  /** Pre-ladder campaign (no level rows): jet skin still follows top contributor user level. */
  legacy_jet: boolean;
};

export type LevelRow = {
  level: number;
  name: string;
  thresholdCoins: number;
  rewardPoolPercentage: number;
  maxWinnersCount: number;
  rewardDistributionRules: unknown;
  frameId: bigint | null;
  frameWinners: number;
  frameDays: number;
  xpRate: number;
  minXp: number;
  durationSeconds: number;
  themeColor: string;
  visualTier: number;
  launchAssetKey: string | null;
  stationAssetKey: string | null;
  badgeAssetKey: string | null;
  luckyAudiencePercent: number;
  luckyPoolPercentage: number;
  isActive: boolean;
};

export type CampaignRow = {
  launchThresholdCoins: number;
  rewardPoolPercentage: number;
  maxWinnersCount: number;
  rewardDistributionRules: unknown;
  minimumContributionRequired: number;
  rockitDurationSeconds: number;
  dailyResetEnabled: boolean;
  resetTimezone: string;
  resetHour: number;
  expiryMode: string;
  carryOverflow: boolean;
};

export const ALL_TIME_CYCLE = 'ALL';
export const MAX_THRESHOLD_COINS = 1_000_000_000;
export const MAX_LEVELS = 50;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

function ymdInZone(instant: Date, timeZone: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

/** Offset (ms) of [timeZone] from UTC at [instant]; +5:30 → 19_800_000. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000) * 60_000;
}

export function safeTimeZone(tz: string | null | undefined): string {
  const zone = (tz || '').trim() || 'Asia/Kolkata';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return 'Asia/Kolkata';
  }
}

/** Cycle id for [now]: the local date whose reset hour started the current cycle. */
export function cycleKeyAt(now: Date, campaign: Pick<CampaignRow, 'dailyResetEnabled' | 'resetTimezone' | 'resetHour'>): string {
  if (!campaign.dailyResetEnabled) return ALL_TIME_CYCLE;
  const tz = safeTimeZone(campaign.resetTimezone);
  const hour = clampInt(campaign.resetHour, 0, 23);
  const { y, m, d } = ymdInZone(new Date(now.getTime() - hour * HOUR_MS), tz);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Instant the current cycle ends (next reset), or null when daily reset is off. */
export function nextResetAt(now: Date, campaign: Pick<CampaignRow, 'dailyResetEnabled' | 'resetTimezone' | 'resetHour'>): Date | null {
  if (!campaign.dailyResetEnabled) return null;
  const tz = safeTimeZone(campaign.resetTimezone);
  const hour = clampInt(campaign.resetHour, 0, 23);
  const [y, m, d] = cycleKeyAt(now, campaign).split('-').map(Number);
  const startLocalAsUtc = Date.UTC(y, m - 1, d, hour);
  const start = startLocalAsUtc - zoneOffsetMs(new Date(startLocalAsUtc), tz);
  return new Date(start + DAY_MS);
}

export function eventExpiry(now: Date, snapshotDurationSeconds: number, campaign: CampaignRow): Date {
  const reset = nextResetAt(now, campaign);
  const fallbackSec = Math.max(60, campaign.rockitDurationSeconds || 3600);
  const durMs = snapshotDurationSeconds > 0 ? snapshotDurationSeconds * 1000 : reset ? Infinity : fallbackSec * 1000;
  const byDuration = now.getTime() + durMs;
  const end = reset ? Math.min(reset.getTime(), byDuration) : byDuration;
  return new Date(end);
}

export function parseRules(json: unknown): number[] {
  return Array.isArray(json) ? json.map(Number).filter((n) => Number.isFinite(n) && n > 0) : [];
}

/** Active ladder sorted by level; a campaign without level rows behaves as a single legacy level. */
export function activeLadder(campaign: CampaignRow, levels: LevelRow[]): LevelRow[] {
  const active = levels.filter((l) => l.isActive && l.thresholdCoins > 0).sort((a, b) => a.level - b.level);
  if (active.length > 0) return active;
  return [
    {
      level: 1,
      name: 'Rockit',
      thresholdCoins: campaign.launchThresholdCoins,
      rewardPoolPercentage: campaign.rewardPoolPercentage,
      maxWinnersCount: campaign.maxWinnersCount,
      rewardDistributionRules: campaign.rewardDistributionRules,
      frameId: null,
      frameWinners: 3,
      frameDays: 3,
      xpRate: 0.02,
      minXp: 20,
      durationSeconds: campaign.rockitDurationSeconds,
      themeColor: '#22C55E',
      visualTier: 3,
      launchAssetKey: null,
      stationAssetKey: null,
      badgeAssetKey: null,
      luckyAudiencePercent: 0,
      luckyPoolPercentage: 0,
      isActive: true,
    },
  ];
}

export function snapshotOf(level: LevelRow, campaign: CampaignRow, legacy: boolean): RocketLevelSnapshot & { duration_seconds: number } {
  const rules = parseRules(level.rewardDistributionRules);
  const maxWinners = Math.max(1, level.maxWinnersCount);
  return {
    level: level.level,
    name: level.name,
    threshold: level.thresholdCoins,
    reward_pool_percentage: level.rewardPoolPercentage,
    max_winners: maxWinners,
    rules: (rules.length ? rules : [40, 25, 15, 10, 5, 3, 2]).slice(0, maxWinners),
    frame_id: level.frameId == null ? null : Number(level.frameId),
    frame_winners: Math.max(0, level.frameWinners),
    frame_days: Math.max(1, level.frameDays),
    xp_rate: Math.max(0, level.xpRate),
    min_xp: Math.max(0, level.minXp),
    theme_color: level.themeColor,
    visual_tier: clampInt(level.visualTier, 1, 5),
    launch_asset_key: level.launchAssetKey,
    station_asset_key: level.stationAssetKey,
    badge_asset_key: level.badgeAssetKey,
    min_contribution: Math.max(1, campaign.minimumContributionRequired),
    lucky_audience_percent: clampPercent(level.luckyAudiencePercent),
    lucky_pool_percentage: clampPercent(level.luckyPoolPercentage),
    legacy_jet: legacy,
    duration_seconds: Math.max(0, level.durationSeconds),
  };
}

/** Level after [level] in the ladder; wraps to the first level after the top. */
export function nextLevelAfter(ladder: LevelRow[], level: number): LevelRow {
  return ladder.find((l) => l.level > level) ?? ladder[0];
}

/** Level at or above [level] (used when the previous level was removed by an admin). */
export function levelAtOrAbove(ladder: LevelRow[], level: number): LevelRow {
  return ladder.find((l) => l.level >= level) ?? ladder[0];
}

/**
 * Which level a room should be on when no PENDING event exists in the current cycle.
 * [last] is the latest LAUNCHED/EXPIRED event in this cycle, if any.
 */
export function resolveLevel(
  ladder: LevelRow[],
  last: { status: string; level: number } | null,
  expiryMode: string,
): LevelRow {
  if (!last) return ladder[0];
  if (last.status === 'LAUNCHED') return nextLevelAfter(ladder, last.level);
  if (expiryMode === 'RESET_CYCLE') return ladder[0];
  return levelAtOrAbove(ladder, last.level);
}

/**
 * Split a contribution between the current level and the next.
 * At most one launch per contribution: carry is capped one coin below the next threshold.
 */
export function splitContribution(
  accumulated: number,
  threshold: number,
  coins: number,
  nextThreshold: number,
  carryOverflow: boolean,
): { applied: number; launches: boolean; carry: number } {
  const room = Math.max(0, threshold - accumulated);
  if (coins < room) return { applied: coins, launches: false, carry: 0 };
  const overflow = coins - room;
  const carry = carryOverflow ? Math.max(0, Math.min(overflow, nextThreshold - 1)) : 0;
  return { applied: room, launches: true, carry };
}

export function splitByPercent(pool: number, percents: number[]): number[] {
  if (percents.length === 0 || pool <= 0) return [];
  const sum = percents.reduce((a, b) => a + b, 0) || 1;
  const shares = percents.map((p) => Math.floor((pool * p) / sum));
  const used = shares.reduce((a, b) => a + b, 0);
  if (used < pool) shares[0] += pool - used;
  return shares;
}

function clampPercent(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

/**
 * Random lucky winners: [percent]% of [candidates] (at least 1 when percent > 0), capped at
 * [maxWinners] so every winner can receive at least one coin.
 */
export function pickLuckyWinners<T>(candidates: T[], percent: number, maxWinners: number, rng: () => number = Math.random): T[] {
  const pct = clampPercent(percent);
  if (pct <= 0 || candidates.length === 0 || maxWinners <= 0) return [];
  const count = Math.min(Math.max(1, Math.floor((candidates.length * pct) / 100)), maxWinners, candidates.length);
  const pool = [...candidates];
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

/** Lucky shares never go below this fraction of an equal split, so nobody wins a token amount. */
const LUCKY_FLOOR_RATIO = 0.3;

/** Splits [pool] into [count] random shares, each ≥ 30% of an equal share, summing to [pool]. */
export function splitLucky(pool: number, count: number, rng: () => number = Math.random): number[] {
  if (count <= 0 || pool <= 0) return [];
  // Callers cap count at pool, so the 1-coin minimum always fits.
  const floor = Math.max(pool >= count ? 1 : 0, Math.floor((pool / count) * LUCKY_FLOOR_RATIO));
  const spare = pool - floor * count;
  const weights = Array.from({ length: count }, () => rng() + 0.01);
  const sum = weights.reduce((a, b) => a + b, 0);
  const shares = weights.map((w) => floor + Math.floor((spare * w) / sum));
  const used = shares.reduce((a, b) => a + b, 0);
  shares[Math.floor(rng() * count) % count] += pool - used;
  return shares;
}

export function clampInt(v: unknown, min: number, max: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export type LevelInput = {
  level: number;
  name?: string;
  threshold_coins: number;
  reward_pool_percentage: number;
  reward_distribution_rules: number[];
  frame_id?: number | null;
  frame_winners?: number;
  frame_days?: number;
  xp_rate?: number;
  min_xp?: number;
  duration_seconds?: number;
  theme_color?: string;
  visual_tier?: number;
  launch_asset_key?: string | null;
  station_asset_key?: string | null;
  badge_asset_key?: string | null;
  lucky_audience_percent?: number;
  lucky_pool_percentage?: number;
  is_active?: boolean;
};

/** Validates an admin ladder; returns human-readable errors (empty = valid). */
export function validateLevels(levels: LevelInput[]): string[] {
  const errors: string[] = [];
  if (!Array.isArray(levels) || levels.length === 0) return ['At least one level is required'];
  if (levels.length > MAX_LEVELS) errors.push(`At most ${MAX_LEVELS} levels`);
  const sorted = [...levels].sort((a, b) => a.level - b.level);
  sorted.forEach((l, i) => {
    const tag = `LV${l.level}`;
    if (l.level !== i + 1) errors.push(`Levels must be numbered 1..${sorted.length} without gaps (found LV${l.level})`);
    const t = Number(l.threshold_coins);
    if (!Number.isInteger(t) || t < 1 || t > MAX_THRESHOLD_COINS) {
      errors.push(`${tag}: target must be 1 – ${MAX_THRESHOLD_COINS.toLocaleString('en-US')} coins`);
    }
    if (i > 0 && t <= Number(sorted[i - 1].threshold_coins)) {
      errors.push(`${tag}: target must be higher than LV${sorted[i - 1].level}`);
    }
    const pool = Number(l.reward_pool_percentage);
    if (!Number.isFinite(pool) || pool < 0 || pool > 100) errors.push(`${tag}: reward pool must be 0 – 100%`);
    const luckyAudience = Number(l.lucky_audience_percent ?? 0);
    if (!Number.isFinite(luckyAudience) || luckyAudience < 0 || luckyAudience > 100) {
      errors.push(`${tag}: lucky audience must be 0 – 100%`);
    }
    const luckyPool = Number(l.lucky_pool_percentage ?? 0);
    if (!Number.isFinite(luckyPool) || luckyPool < 0 || luckyPool > 100) errors.push(`${tag}: lucky pool must be 0 – 100%`);
    if (Number.isFinite(pool) && Number.isFinite(luckyPool) && pool + luckyPool > 100) {
      errors.push(`${tag}: reward pool + lucky pool must not exceed 100%`);
    }
    const rules = parseRules(l.reward_distribution_rules);
    if (rules.length === 0 || rules.length > 50) errors.push(`${tag}: prize split needs 1 – 50 winners`);
    const sum = rules.reduce((a, b) => a + b, 0);
    if (rules.length && Math.abs(sum - 100) > 0.5) errors.push(`${tag}: prize split sums to ${sum}%, must be 100%`);
    if (l.theme_color != null && !/^#[0-9a-fA-F]{6}$/.test(l.theme_color)) errors.push(`${tag}: theme colour must be #RRGGBB`);
    const days = l.frame_days ?? 3;
    if (!Number.isInteger(days) || days < 1 || days > 365) errors.push(`${tag}: frame days must be 1 – 365`);
    const dur = l.duration_seconds ?? 0;
    if (!Number.isInteger(dur) || dur < 0 || dur > 7 * 86400) errors.push(`${tag}: time limit must be 0 – 604800 seconds`);
  });
  return errors;
}

/** Standard ladder for new campaigns; reuses the five GCS jet videos (rocket.launch_lv1..5). */
export const DEFAULT_LADDER: LevelInput[] = [
  { level: 1, name: 'Emerald', threshold_coins: 10_000_000, reward_pool_percentage: 12, reward_distribution_rules: [40, 25, 15, 12, 8], frame_days: 1, theme_color: '#10B981', visual_tier: 1, launch_asset_key: 'rocket.launch_lv1' },
  { level: 2, name: 'Amethyst', threshold_coins: 30_000_000, reward_pool_percentage: 13, reward_distribution_rules: [35, 22, 15, 10, 8, 6, 4], frame_days: 2, theme_color: '#A855F7', visual_tier: 2, launch_asset_key: 'rocket.launch_lv2' },
  { level: 3, name: 'Crimson', threshold_coins: 60_000_000, reward_pool_percentage: 14, reward_distribution_rules: [35, 22, 15, 10, 8, 6, 4], frame_days: 3, theme_color: '#EF4444', visual_tier: 3, launch_asset_key: 'rocket.launch_lv3' },
  { level: 4, name: 'Solar Gold', threshold_coins: 100_000_000, reward_pool_percentage: 15, reward_distribution_rules: [30, 18, 12, 10, 8, 6, 5, 4, 4, 3], frame_days: 5, theme_color: '#F59E0B', visual_tier: 4, launch_asset_key: 'rocket.launch_lv4' },
  { level: 5, name: 'Cosmic', threshold_coins: 150_000_000, reward_pool_percentage: 16, reward_distribution_rules: [30, 18, 12, 10, 8, 6, 5, 4, 4, 3], frame_days: 7, theme_color: '#6366F1', visual_tier: 5, launch_asset_key: 'rocket.launch_lv5' },
];

export type AssetSlot = 'launch' | 'station' | 'badge';

const SLOT_RULES: Record<AssetSlot, { exts: string[]; maxBytes: number; label: string }> = {
  launch: { exts: ['webm', 'mp4'], maxBytes: 8 * 1024 * 1024, label: 'Launch video' },
  station: { exts: ['webm', 'mp4'], maxBytes: 8 * 1024 * 1024, label: 'Station video' },
  badge: { exts: ['png', 'webp'], maxBytes: 1024 * 1024, label: 'Badge image' },
};

export function assetKeyFor(slot: AssetSlot, level: number): string {
  return `rocket.${slot}_lv${level}`;
}

/** Checks extension, size and magic bytes; returns {ext, mediaType} or an error message. */
export function sniffAsset(
  slot: AssetSlot,
  filename: string,
  buf: Buffer,
): { ok: true; ext: string; mediaType: 'video' | 'image' } | { ok: false; error: string } {
  const rule = SLOT_RULES[slot];
  if (!rule) return { ok: false, error: 'Unknown asset slot' };
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (!rule.exts.includes(ext)) return { ok: false, error: `${rule.label} must be ${rule.exts.join(' or ')}` };
  if (buf.length === 0) return { ok: false, error: 'File is empty' };
  if (buf.length > rule.maxBytes) {
    return { ok: false, error: `${rule.label} must be ≤ ${Math.round(rule.maxBytes / 1024 / 1024)} MB (got ${(buf.length / 1024 / 1024).toFixed(1)} MB)` };
  }
  const hex = buf.subarray(0, 4).toString('hex');
  const valid =
    (ext === 'webm' && hex === '1a45dfa3') ||
    (ext === 'mp4' && buf.subarray(4, 8).toString('ascii') === 'ftyp') ||
    (ext === 'png' && hex === '89504e47') ||
    (ext === 'webp' && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP');
  if (!valid) return { ok: false, error: `File content is not a real .${ext}` };
  return { ok: true, ext, mediaType: slot === 'badge' ? 'image' : 'video' };
}

/**
 * Admin Settings (extraSettings) is the source of truth for streak, referral,
 * AdMob and game toggles; legacy `bonusConfig` JSON only fills gaps.
 */
type Json = Record<string, unknown>;

function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
}

function bool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return undefined;
}

function obj(v: unknown): Json {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {};
}

export const STREAK_DAYS = 7;

export function resolveStreak(
  base: { enabled: boolean; rewards: number[] },
  extra: Json,
): { enabled: boolean; rewards: number[] } {
  const rewards = Array.from({ length: STREAK_DAYS }, (_, i) => {
    const admin = num(extra[`streak_day_${i + 1}_coins`]);
    return admin ?? num(base.rewards[i]) ?? 0;
  });
  return {
    enabled: bool(extra.streak_enabled) ?? base.enabled,
    rewards,
  };
}

export function resolveReferralMilestone(
  base: { enabled: boolean; required_count: number; coins: number },
  extra: Json,
) {
  return {
    enabled: bool(extra.referral_milestone_enabled) ?? base.enabled,
    required_count: Math.max(
      num(extra.referral_milestone_required_count) ?? base.required_count,
      1,
    ),
    coins: num(extra.referral_milestone_coins) ?? base.coins,
  };
}

export function resolveReferralRewards(extra: Json) {
  return {
    referrer_coins:
      num(extra.referral_reward_referrer) ??
      num(process.env.REFERRAL_REWARD_REFERRER) ??
      100,
    referee_coins:
      num(extra.referral_reward_referee) ??
      num(process.env.REFERRAL_REWARD_REFEREE) ??
      50,
  };
}

export function resolveAdmob<
  T extends { enabled: boolean; coins: number; daily_limit: number },
>(base: T, extra: Json): T {
  return {
    ...base,
    enabled: bool(extra.admob_enabled) ?? base.enabled,
    coins: num(extra.admob_ad_coins) ?? base.coins,
    daily_limit: num(extra.admob_daily_ad_limit) ?? base.daily_limit,
  };
}

export function resolveGameEnabled<T extends { enabled: boolean }>(
  base: T,
  extra: Json,
  key: 'game_1' | 'game_2' | 'game_3',
): T {
  return { ...base, enabled: bool(extra[`${key}_enabled`]) ?? base.enabled };
}

export function legacyBonusSection(bonusConfig: unknown, key: string): Json {
  return obj(obj(bonusConfig)[key]);
}

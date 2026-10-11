/**
 * Room Reward Levels settings, stored in admin_settings.extra_settings (editable from the admin
 * panel). Values are clamped here, so a bad admin entry can never break the feature.
 */
export type RoomRewardSettings = {
  /** Master switch. Ships OFF; turned on from the admin panel. */
  enabled: boolean;
  /** Continuous minutes in the room before a visitor counts toward a level. */
  presenceMinutes: number;
  /** A drop shorter than this (minutes) does not break a visitor's continuous stay. */
  presenceGapMinutes: number;
};

export const ROOM_REWARD_SETTING_KEYS = {
  enabled: 'room_reward_enabled',
  presenceMinutes: 'room_reward_presence_minutes',
  presenceGapMinutes: 'room_reward_presence_gap_minutes',
} as const;

export const ROOM_REWARD_DEFAULTS: RoomRewardSettings = {
  enabled: false,
  presenceMinutes: 10,
  presenceGapMinutes: 2,
};

function intIn(raw: unknown, fallback: number, min: number, max: number): number {
  const n =
    typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function bool(raw: unknown, fallback: boolean): boolean {
  if (typeof raw === 'boolean') return raw;
  if (raw === 'true' || raw === 1 || raw === '1') return true;
  if (raw === 'false' || raw === 0 || raw === '0') return false;
  return fallback;
}

export function readRoomRewardSettings(
  extra: Record<string, unknown> | null | undefined,
): RoomRewardSettings {
  const e = extra ?? {};
  return {
    enabled: bool(e[ROOM_REWARD_SETTING_KEYS.enabled], ROOM_REWARD_DEFAULTS.enabled),
    presenceMinutes: intIn(
      e[ROOM_REWARD_SETTING_KEYS.presenceMinutes],
      ROOM_REWARD_DEFAULTS.presenceMinutes,
      0,
      240,
    ),
    presenceGapMinutes: intIn(
      e[ROOM_REWARD_SETTING_KEYS.presenceGapMinutes],
      ROOM_REWARD_DEFAULTS.presenceGapMinutes,
      0,
      30,
    ),
  };
}

/** Settings as admin-panel / API fields. */
export function roomRewardSettingsForApi(s: RoomRewardSettings) {
  return {
    [ROOM_REWARD_SETTING_KEYS.enabled]: s.enabled,
    [ROOM_REWARD_SETTING_KEYS.presenceMinutes]: s.presenceMinutes,
    [ROOM_REWARD_SETTING_KEYS.presenceGapMinutes]: s.presenceGapMinutes,
  };
}

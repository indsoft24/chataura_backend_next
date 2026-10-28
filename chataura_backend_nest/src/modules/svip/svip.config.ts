/**
 * SVIP settings, stored in admin_settings.extra_settings (editable from the super admin panel).
 * Values are clamped here, so a bad admin entry can never break the feature.
 */
export type SvipSettings = {
  /** Master switch for unlocking SVIP by recharge. Ships OFF; existing members keep their level until it ends. */
  enabled: boolean;
  /** Monthly maintenance fee as a % of the level's purchase price. */
  maintenancePct: number;
  /** Days a member keeps SVIP after a failed renewal before it ends. */
  graceDays: number;
  /** Length of one paid period. */
  periodDays: number;
  /** A recharge counts towards SVIP for this many days. */
  rechargeDays: number;
  /** Renewing early (coins or recharge) is allowed in the last this-many days of a period. */
  renewDays: number;
};

export const SVIP_SETTING_KEYS = {
  enabled: 'svip_enabled',
  maintenancePct: 'svip_maintenance_pct',
  graceDays: 'svip_grace_days',
  periodDays: 'svip_period_days',
  rechargeDays: 'svip_recharge_days',
  renewDays: 'svip_renew_days',
} as const;

export const SVIP_DEFAULTS: SvipSettings = {
  enabled: false,
  maintenancePct: 20,
  graceDays: 3,
  periodDays: 30,
  rechargeDays: 5,
  renewDays: 5,
};

function intIn(
  raw: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const n =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && raw.trim()
        ? Number(raw)
        : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function bool(raw: unknown, fallback: boolean): boolean {
  if (typeof raw === 'boolean') return raw;
  if (raw === 'true' || raw === 1 || raw === '1') return true;
  if (raw === 'false' || raw === 0 || raw === '0') return false;
  return fallback;
}

export function readSvipSettings(
  extra: Record<string, unknown> | null | undefined,
): SvipSettings {
  const e = extra ?? {};
  return {
    enabled: bool(e[SVIP_SETTING_KEYS.enabled], SVIP_DEFAULTS.enabled),
    maintenancePct: intIn(
      e[SVIP_SETTING_KEYS.maintenancePct],
      SVIP_DEFAULTS.maintenancePct,
      0,
      100,
    ),
    graceDays: intIn(
      e[SVIP_SETTING_KEYS.graceDays],
      SVIP_DEFAULTS.graceDays,
      0,
      30,
    ),
    periodDays: intIn(
      e[SVIP_SETTING_KEYS.periodDays],
      SVIP_DEFAULTS.periodDays,
      1,
      365,
    ),
    rechargeDays: intIn(
      e[SVIP_SETTING_KEYS.rechargeDays],
      SVIP_DEFAULTS.rechargeDays,
      1,
      60,
    ),
    renewDays: intIn(
      e[SVIP_SETTING_KEYS.renewDays],
      SVIP_DEFAULTS.renewDays,
      0,
      30,
    ),
  };
}

/** Settings as admin-panel / API fields. */
export function svipSettingsForApi(s: SvipSettings) {
  return {
    [SVIP_SETTING_KEYS.enabled]: s.enabled,
    [SVIP_SETTING_KEYS.maintenancePct]: s.maintenancePct,
    [SVIP_SETTING_KEYS.graceDays]: s.graceDays,
    [SVIP_SETTING_KEYS.periodDays]: s.periodDays,
    [SVIP_SETTING_KEYS.rechargeDays]: s.rechargeDays,
    [SVIP_SETTING_KEYS.renewDays]: s.renewDays,
  };
}

/** What an installed build should do, from admin_settings.extra_settings (app_latest_version_code / app_min_version_code; 0 = unset). */
export function appUpdateStatus(installedCode: number, extra: Record<string, unknown> | null | undefined) {
  const num = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0);
  const latest = num(extra?.app_latest_version_code);
  const min = num(extra?.app_min_version_code);
  const code = num(installedCode);
  return {
    latest_code: latest,
    min_code: min,
    // An unknown installed code (0) never blocks anyone.
    update_required: code > 0 && min > 0 && code < min,
    update_available: code > 0 && latest > 0 && code < latest,
  };
}

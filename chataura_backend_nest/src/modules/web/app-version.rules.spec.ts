import { appUpdateStatus } from './app-version.rules';

describe('appUpdateStatus', () => {
  const extra = { app_latest_version_code: 64, app_min_version_code: 62 };
  it('asks for an update below the minimum, offers one below the latest', () => {
    expect(appUpdateStatus(61, extra)).toMatchObject({ update_required: true, update_available: true });
    expect(appUpdateStatus(63, extra)).toMatchObject({ update_required: false, update_available: true });
    expect(appUpdateStatus(64, extra)).toMatchObject({ update_required: false, update_available: false });
  });
  it('does nothing when unset or when the installed build is unknown', () => {
    expect(appUpdateStatus(10, {})).toMatchObject({ update_required: false, update_available: false });
    expect(appUpdateStatus(10, null)).toMatchObject({ update_required: false });
    expect(appUpdateStatus(NaN, extra)).toMatchObject({ update_required: false, update_available: false });
  });
});

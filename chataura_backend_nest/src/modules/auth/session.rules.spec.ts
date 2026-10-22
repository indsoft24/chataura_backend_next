import {
  canCreateAccount,
  canUseDevice,
  DEFAULT_MAX_ACCOUNTS_PER_DEVICE,
  LOGGED_OUT_SESSION,
  normalizeDeviceId,
  PANEL_SESSION,
  readMaxAccountsPerDevice,
  sessionMatches,
  tokenAllowed,
} from './session.rules';

describe('tokenAllowed', () => {
  it('panel tokens work beside the phone session, for admins only', () => {
    expect(tokenAllowed(PANEL_SESSION, 'phone-sid', 'admin')).toBe(true);
    expect(tokenAllowed(PANEL_SESSION, 'phone-sid', 'user')).toBe(false);
    expect(tokenAllowed('old', 'phone-sid', 'admin')).toBe(false);
  });
});

describe('sessionMatches', () => {
  it('a user without a session yet keeps old tokens working', () => {
    expect(sessionMatches(undefined, null)).toBe(true);
  });
  it('only the newest login matches', () => {
    expect(sessionMatches('b', 'b')).toBe(true);
    expect(sessionMatches('a', 'b')).toBe(false);
    expect(sessionMatches(undefined, 'b')).toBe(false);
  });
  it('after logout nothing matches', () => {
    expect(sessionMatches('a', LOGGED_OUT_SESSION)).toBe(false);
  });
});

describe('device limits', () => {
  it('accepts real ids and rejects junk', () => {
    expect(normalizeDeviceId(' 9774d56d682e549c ')).toBe('9774d56d682e549c');
    expect(normalizeDeviceId('')).toBeNull();
    expect(normalizeDeviceId('abc')).toBeNull();
    expect(normalizeDeviceId("x'; drop table")).toBeNull();
    expect(normalizeDeviceId('unknown')).toBeNull();
  });
  it('allows up to the cap', () => {
    expect(canCreateAccount(0, 2)).toBe(true);
    expect(canCreateAccount(1, 2)).toBe(true);
    expect(canCreateAccount(2, 2)).toBe(false);
    expect(canCreateAccount(0, 0)).toBe(true);
  });
  it('only the first accounts on a phone may log in there', () => {
    expect(canUseDevice(9n, [], 2)).toBe(true);
    expect(canUseDevice(9n, [1n], 2)).toBe(true);
    expect(canUseDevice(1n, [1n, 2n], 2)).toBe(true);
    expect(canUseDevice(2n, [1n, 2n], 2)).toBe(true);
    expect(canUseDevice(3n, [1n, 2n], 2)).toBe(false);
  });
  it('reads the admin cap with a safe default', () => {
    expect(readMaxAccountsPerDevice({ max_accounts_per_device: 3 })).toBe(3);
    expect(readMaxAccountsPerDevice({ max_accounts_per_device: 'x' })).toBe(DEFAULT_MAX_ACCOUNTS_PER_DEVICE);
    expect(readMaxAccountsPerDevice(null)).toBe(DEFAULT_MAX_ACCOUNTS_PER_DEVICE);
  });
});

import { referrerIsActive, withinReferralWindow } from './referral.rules';

describe('referral rules', () => {
  const now = new Date('2026-11-10T00:00:00Z');
  it('accepts a new account and rejects an old one', () => {
    expect(withinReferralWindow(new Date('2026-11-05T00:00:00Z'), now)).toBe(true);
    expect(withinReferralWindow(new Date('2026-10-01T00:00:00Z'), now)).toBe(false);
  });
  it('rejects deleted or suspended referrers', () => {
    expect(referrerIsActive({ deletedAt: null, accountStatus: 'active', isSuspended: false })).toBe(true);
    expect(referrerIsActive({ deletedAt: new Date(), accountStatus: 'active', isSuspended: false })).toBe(false);
    expect(referrerIsActive({ deletedAt: null, accountStatus: 'suspended', isSuspended: false })).toBe(false);
    expect(referrerIsActive({ deletedAt: null, accountStatus: 'active', isSuspended: true })).toBe(false);
  });
});

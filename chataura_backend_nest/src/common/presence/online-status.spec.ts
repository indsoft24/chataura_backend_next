import { publicUserForApi, userForApi } from '../../modules/user/user.serializer';
import { isDisplayIdConflict } from '../../modules/user/display-id';
import { Prisma } from '@prisma/client';
import { ONLINE_WINDOW_MS, isEffectivelyOnline, presenceFields } from './online-status';

const NOW = Date.parse('2026-10-10T12:00:00Z');

describe('online status', () => {
  it('is online only while recently seen', () => {
    const fresh = { isOnline: true, lastSeenAt: new Date(NOW - 30_000) };
    const stale = { isOnline: true, lastSeenAt: new Date(NOW - ONLINE_WINDOW_MS - 1) };
    expect(isEffectivelyOnline(fresh, NOW)).toBe(true);
    expect(isEffectivelyOnline(stale, NOW)).toBe(false);
    expect(isEffectivelyOnline({ isOnline: false, lastSeenAt: new Date(NOW) }, NOW)).toBe(false);
    expect(isEffectivelyOnline({ isOnline: true, lastSeenAt: null }, NOW)).toBe(false);
  });

  it('hides status from others when show_online_status is off, not from self', () => {
    const user = { isOnline: true, lastSeenAt: new Date(NOW), showOnlineStatus: false };
    expect(presenceFields(user, { now: NOW })).toEqual({ is_online: false, last_seen_at: null });
    expect(presenceFields(user, { self: true, now: NOW }).is_online).toBe(true);
  });
});

describe('publicUserForApi', () => {
  const user = {
    id: 5n,
    email: 'secret@x.y',
    phone: '+910000000000',
    name: 'B',
    displayName: 'B',
    avatarUrl: null,
    bio: null,
    gender: null,
    dob: new Date('2000-01-01'),
    language: null,
    country: null,
    role: 'user',
    inviteCode: 'INV',
    emailVerifiedAt: null,
    level: 1,
    exp: 0,
    xp: 0n,
    walletBalance: 999n,
    referralBalance: 5n,
    gems: 7n,
    inrEarningsBalance: 1n,
    usdEarningsBalance: 1n,
    displayId: '1234567',
    showOnlineStatus: true,
    isOnline: true,
    lastSeenAt: new Date(),
    createdAt: new Date('2026-01-01T00:00:00Z'),
  } as any;

  it('never exposes contact details or balances of another user', () => {
    const out = publicUserForApi(user);
    for (const key of ['email', 'phone', 'dob', 'invite_code', 'coins', 'wallet_balance', 'gems', 'referral_balance']) {
      expect(out).not.toHaveProperty(key);
    }
    expect(out.display_id).toBe('1234567');
    expect(out.id).toBe(5);
  });

  it('keeps private fields for the account owner', () => {
    const out = userForApi(user);
    expect(out.email).toBe('secret@x.y');
    expect(out.wallet_balance).toBe(999);
  });
});

describe('isDisplayIdConflict', () => {
  const err = (target: unknown) =>
    new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'x',
      meta: { target },
    });

  it('detects a duplicate display_id only', () => {
    expect(isDisplayIdConflict(err(['display_id']))).toBe(true);
    expect(isDisplayIdConflict(err('users_display_id_key'))).toBe(true);
    expect(isDisplayIdConflict(err(['email']))).toBe(false);
    expect(isDisplayIdConflict(new Error('x'))).toBe(false);
  });
});

import { userForApi } from './user.serializer';

describe('userForApi coin fields', () => {
  it('reports coins, coin_balance and wallet_balance from wallet_balance', () => {
    const user = {
      id: 1n,
      email: 'a@b.c',
      phone: null,
      name: 'A',
      displayName: 'A',
      avatarUrl: null,
      bio: null,
      gender: null,
      dob: null,
      language: null,
      country: null,
      role: 'user',
      inviteCode: null,
      emailVerifiedAt: null,
      level: 1,
      exp: 0,
      xp: 0n,
      walletBalance: 12345n,
      referralBalance: 0n,
      gems: 0n,
      inrEarningsBalance: 0n,
      usdEarningsBalance: 0n,
      displayId: '7842109',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    } as any;
    const out = userForApi(user);
    expect(out.coins).toBe(12345);
    expect(out.coin_balance).toBe(12345);
    expect(out.wallet_balance).toBe(12345);
    expect(out.display_id).toBe('7842109');
  });

  it('falls back to string id when displayId is null', () => {
    const user = {
      id: 3n,
      email: 'bibhu@test.com',
      name: 'Bibhu',
      role: 'user',
      displayId: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    } as any;
    const out = userForApi(user);
    expect(out.display_id).toBe('3');
  });
});

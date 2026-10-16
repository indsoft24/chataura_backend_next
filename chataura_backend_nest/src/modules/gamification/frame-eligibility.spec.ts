import { eligibleFrames, relationshipFrameSlugs, staffRoleKey } from './frame-eligibility';

const f = (id: number, category: string | null, slug: string | null = null, animationKey: string | null = null) => ({
  id: BigInt(id),
  category,
  slug,
  animationKey,
});

const frames = [
  f(1, 'avatar', 'legendary'),
  f(2, 'avatar', 'cat_paw'),
  f(3, 'rocket', 'rocket_frame_lv1_emerald'),
  f(4, 'special', 'support_frame_official'),
  f(5, 'role', 'royal_laurel', 'admin'),
  f(6, 'role', 'ice_wings', 'coin_seller'),
  f(7, 'RELATIONSHIP', 'rel_frame_cp_normal'),
  f(8, 'RELATIONSHIP', 'rel_frame_cp_rank1'),
  f(9, 'RELATIONSHIP', 'rel_frame_bcp_normal'),
];
const now = new Date('2026-10-16T12:00:00Z');
const base = { frames, unlocks: [], role: 'user', staffBadgeType: null, relationships: [], now };

describe('eligibleFrames', () => {
  it('normal user: owned paid / free / reward frames, skipping expired ones', () => {
    const out = eligibleFrames({
      ...base,
      unlocks: [
        { frameId: 1n, expiresAt: null, coinsPaid: 100000, unlockType: 'purchase' },
        { frameId: 2n, expiresAt: null, coinsPaid: 0, unlockType: 'level' },
        { frameId: 3n, expiresAt: new Date('2026-10-15T00:00:00Z'), coinsPaid: 0, unlockType: 'rocket' },
        { frameId: 4n, expiresAt: null, coinsPaid: 0, unlockType: 'admin' },
      ],
    });
    expect(Object.fromEntries(out)).toEqual({ '1': 'paid', '2': 'free', '4': 'support' });
  });

  it('staff keep every owned frame and also get their role frames', () => {
    const out = eligibleFrames({
      ...base,
      role: 'admin',
      unlocks: [{ frameId: 1n, expiresAt: null, coinsPaid: 100000, unlockType: 'purchase' }],
    });
    expect(Object.fromEntries(out)).toEqual({ '1': 'paid', '5': 'role' });
  });

  it('merchant frames: a seller owns every coin_seller role frame; nobody else does', () => {
    const merchant = [...frames, f(293, 'role', 'merchant_frame_gold', 'coin_seller'), f(296, 'role', 'merchant_frame_sapphire', 'coin_seller')];
    const seller = eligibleFrames({ ...base, frames: merchant, role: 'seller' });
    expect(Object.fromEntries(seller)).toEqual({ '6': 'role', '293': 'role', '296': 'role' });
    const user = eligibleFrames({
      ...base,
      frames: merchant,
      unlocks: [{ frameId: 293n, expiresAt: null, coinsPaid: 0, unlockType: 'admin' }],
    });
    expect(user.size).toBe(0);
    expect(eligibleFrames({ ...base, frames: merchant, role: 'admin' }).has('293')).toBe(false);
  });

  it('role frames come only from the current role, never from an old unlock row', () => {
    const out = eligibleFrames({
      ...base,
      unlocks: [{ frameId: 5n, expiresAt: null, coinsPaid: 0, unlockType: 'role' }],
    });
    expect(out.size).toBe(0);
  });

  it('active CP gives the CP frame, rank 1 adds the rank-1 frame; BCP stays locked', () => {
    expect(Object.fromEntries(eligibleFrames({ ...base, relationships: [{ typeCode: 'cp', isRank1: false }] }))).toEqual({
      '7': 'cp',
    });
    expect(Object.fromEntries(eligibleFrames({ ...base, relationships: [{ typeCode: 'cp', isRank1: true }] }))).toEqual({
      '7': 'cp',
      '8': 'cp',
    });
  });
});

describe('helpers', () => {
  it('maps staff roles to role-frame keys', () => {
    expect(staffRoleKey('user', null)).toBeNull();
    expect(staffRoleKey('seller', null)).toBe('coin_seller');
    expect(staffRoleKey('admin', 'CEO')).toBe('ceo');
  });

  it('only CP / BCP relationships unlock frames', () => {
    expect(relationshipFrameSlugs('friend', false)).toEqual([]);
  });
});

import { tierOf, rankOf, canManageTier, isTier } from './admin-tier';

describe('admin-tier', () => {
  it('maps badge to tier, non-admin role is not a tier', () => {
    expect(tierOf('admin', 'ceo')).toBe('ceo');
    expect(tierOf('admin', null)).toBe('admin'); // badge-less admin = lowest tier
    expect(tierOf('admin', 'weird')).toBe('admin');
    expect(tierOf('seller', 'ceo')).toBeNull();
    expect(rankOf('user', null)).toBe(0);
  });

  it('enforces the creation hierarchy (target strictly below actor)', () => {
    // superadmin makes everyone below
    expect(canManageTier('superadmin', 'ceo')).toBe(true);
    expect(canManageTier('superadmin', 'admin')).toBe(true);
    // ceo makes manager/admin but NOT another ceo
    expect(canManageTier('ceo', 'manager')).toBe(true);
    expect(canManageTier('ceo', 'admin')).toBe(true);
    expect(canManageTier('ceo', 'ceo')).toBe(false);
    expect(canManageTier('ceo', 'superadmin')).toBe(false);
    // manager makes admin only
    expect(canManageTier('manager', 'admin')).toBe(true);
    expect(canManageTier('manager', 'manager')).toBe(false);
    // admin makes nobody
    expect(canManageTier('admin', 'admin')).toBe(false);
  });

  it('isTier guards unknown values', () => {
    expect(isTier('superadmin')).toBe(true);
    expect(isTier('owner')).toBe(false);
    expect(isTier(null)).toBe(false);
  });
});

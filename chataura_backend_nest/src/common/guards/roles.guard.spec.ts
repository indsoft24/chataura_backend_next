import { ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { MIN_TIER_KEY } from '../decorators/min-tier.decorator';

/** Simulate one request hitting an endpoint with the given @Roles / @MinTier metadata. */
function hit(opts: { roles?: string[]; minTier?: string; user?: unknown }): boolean {
  const reflector = {
    getAllAndOverride: (key: string) =>
      key === ROLES_KEY ? opts.roles : key === MIN_TIER_KEY ? opts.minTier : undefined,
  } as any;
  const ctx = {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => ({ user: opts.user }) }),
  } as any;
  return new RolesGuard(reflector).canActivate(ctx);
}

const admin = (badge: string | null) => ({ role: 'admin', staffBadgeType: badge });

describe('RolesGuard — endpoint access cannot be exceeded', () => {
  // The admin controller is @Roles('admin'); non-admins are rejected outright.
  it('blocks non-admin roles from the admin API', () => {
    expect(() => hit({ roles: ['admin'], user: { role: 'user', staffBadgeType: null } })).toThrow(ForbiddenException);
    expect(() => hit({ roles: ['admin'], user: { role: 'seller', staffBadgeType: null } })).toThrow(ForbiddenException);
    expect(() => hit({ roles: ['admin'], user: { role: 'agency', staffBadgeType: null } })).toThrow(ForbiddenException);
    expect(() => hit({ roles: ['admin'], user: undefined })).toThrow(ForbiddenException);
  });

  it('lets any staff tier reach a plain admin endpoint (superset base)', () => {
    for (const b of [null, 'admin', 'manager', 'ceo', 'superadmin']) {
      expect(hit({ roles: ['admin'], user: admin(b) })).toBe(true);
    }
  });

  it('a ceo-gated endpoint rejects admin and manager, accepts ceo+', () => {
    expect(() => hit({ roles: ['admin'], minTier: 'ceo', user: admin(null) })).toThrow(ForbiddenException);
    expect(() => hit({ roles: ['admin'], minTier: 'ceo', user: admin('admin') })).toThrow(ForbiddenException);
    expect(() => hit({ roles: ['admin'], minTier: 'ceo', user: admin('manager') })).toThrow(ForbiddenException);
    expect(hit({ roles: ['admin'], minTier: 'ceo', user: admin('ceo') })).toBe(true);
    expect(hit({ roles: ['admin'], minTier: 'ceo', user: admin('superadmin') })).toBe(true);
  });

  it('a superadmin-gated endpoint (settings) rejects everyone below superadmin', () => {
    for (const b of [null, 'admin', 'manager', 'ceo']) {
      expect(() => hit({ roles: ['admin'], minTier: 'superadmin', user: admin(b) })).toThrow(ForbiddenException);
    }
    expect(hit({ roles: ['admin'], minTier: 'superadmin', user: admin('superadmin') })).toBe(true);
  });

  it('a forged badge of a non-admin role cannot unlock a tier (rank 0)', () => {
    // Even if a non-admin somehow carried a staff badge, role must still be admin to rank.
    expect(() => hit({ roles: ['admin'], minTier: 'ceo', user: { role: 'user', staffBadgeType: 'superadmin' } })).toThrow(ForbiddenException);
  });
});

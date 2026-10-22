/**
 * Admin panel tiers. All staff keep role='admin'; the tier is their staff_badge_type.
 * superadmin(4) > ceo(3) > manager(2) > admin(1). An actor may create/manage only tiers
 * strictly below their own — that single rule gives: ceo cannot make a ceo, manager makes
 * admin only, admin makes nobody. superadmin is a single fixed account, never made via API.
 * Pure and unit-tested; guards and the staff service call these.
 */
export type AdminTier = 'admin' | 'manager' | 'ceo' | 'superadmin';

export const TIER_RANK: Record<AdminTier, number> = {
  admin: 1,
  manager: 2,
  ceo: 3,
  superadmin: 4,
};

export function isTier(v: unknown): v is AdminTier {
  return typeof v === 'string' && v in TIER_RANK;
}

/** A staff member's tier, or null for non-admin roles. Admin with no/unknown badge = lowest tier. */
export function tierOf(role: string, staffBadgeType: string | null | undefined): AdminTier | null {
  if (role !== 'admin') return null;
  const b = String(staffBadgeType ?? 'admin').toLowerCase().trim();
  return isTier(b) ? b : 'admin';
}

export function rankOf(role: string, staffBadgeType: string | null | undefined): number {
  const t = tierOf(role, staffBadgeType);
  return t ? TIER_RANK[t] : 0;
}

/** Actor may create/manage a target of this tier: target rank strictly below the actor's. */
export function canManageTier(actor: AdminTier, target: AdminTier): boolean {
  return TIER_RANK[target] < TIER_RANK[actor];
}

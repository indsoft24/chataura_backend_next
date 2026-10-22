// Mirrors backend src/common/admin-tier.ts. Backend guards are the real gate; this only
// shapes the UI (which nav/pages/tiers a staff member sees). superadmin>ceo>manager>admin.
export type AdminTier = 'admin' | 'manager' | 'ceo' | 'superadmin';

export const TIER_RANK: Record<AdminTier, number> = {
  admin: 1,
  manager: 2,
  ceo: 3,
  superadmin: 4,
};

export const TIER_LABEL: Record<AdminTier, string> = {
  admin: 'Admin',
  manager: 'Manager',
  ceo: 'CEO',
  superadmin: 'Superadmin',
};

/** A logged-in user's tier, or null if not staff. Admin with no/unknown badge = lowest tier. */
export function tierFromUser(role?: string, badge?: string | null): AdminTier | null {
  if (role !== 'admin') return null;
  const b = String(badge ?? 'admin').toLowerCase().trim();
  return (b in TIER_RANK ? b : 'admin') as AdminTier;
}

export function canCreate(actor: AdminTier, target: AdminTier): boolean {
  return TIER_RANK[target] < TIER_RANK[actor];
}

/** Tiers an actor may assign when creating/editing staff (never superadmin — single fixed account). */
export function creatableTiers(actor: AdminTier): AdminTier[] {
  return (['admin', 'manager', 'ceo'] as AdminTier[]).filter((t) => canCreate(actor, t));
}

/** Minimum tier to see a nav page (by href). Pages not listed need only 'admin'. */
export const PAGE_MIN_TIER: Record<string, AdminTier> = {
  '/settings': 'superadmin',
  '/withdrawals': 'ceo',
  '/transactions': 'ceo',
  '/packages': 'ceo',
  '/coin-sellers': 'ceo',
  '/staff-commissions': 'ceo',
};

export function canSeePage(actor: AdminTier, href: string): boolean {
  const min = PAGE_MIN_TIER[href];
  return !min || TIER_RANK[actor] >= TIER_RANK[min];
}

/** Which panel this build serves, set at build time: superadmin at /nextadmin, staff at /staff. */
export const PANEL: 'superadmin' | 'staff' = process.env.NEXT_PUBLIC_PANEL === 'staff' ? 'staff' : 'superadmin';

/** Superadmin panel admits only the superadmin; staff panel admits ceo/manager/admin. */
export function panelAccepts(tier: AdminTier | null): boolean {
  return PANEL === 'staff' ? tier != null && tier !== 'superadmin' : tier === 'superadmin';
}

export function readTier(): AdminTier | null {
  if (typeof window === 'undefined') return null;
  const t = localStorage.getItem('ca_admin_tier');
  return t && t in TIER_RANK ? (t as AdminTier) : null;
}

/**
 * One frame rule: a user wears one frame at a time, chosen from every frame they can wear now.
 * Pure (unit-tested); the service loads the inputs.
 */

export type FrameSource = 'paid' | 'free' | 'rocket' | 'rank' | 'support' | 'role' | 'cp' | 'bcp';

export type EligibilityFrame = {
  id: bigint;
  category: string | null;
  slug: string | null;
  animationKey: string | null;
};

export type EligibilityInput = {
  frames: EligibilityFrame[];
  /** user_unlocked_frames rows for this user. */
  unlocks: Array<{ frameId: bigint; expiresAt: Date | null; coinsPaid: number; unlockType: string | null }>;
  role: string;
  staffBadgeType: string | null;
  /** C.S (special) frames: every star account may wear them; nobody else, staff included. */
  isStarAccount: boolean;
  /** Active CP / BCP relationships of this user. */
  relationships: Array<{ typeCode: string; isRank1: boolean }>;
  now?: Date;
};

const RELATIONSHIP = 'RELATIONSHIP';
const REWARD_UNLOCKS = new Set(['rocket', 'rank', 'admin']);

/** Role-frame key for a staff account (matches frames.animation_key), or null for normal users. */
export function staffRoleKey(role: string, staffBadgeType: string | null): string | null {
  const r = role.toLowerCase();
  if (r === 'agency') return 'agency';
  if (r === 'seller') return 'coin_seller';
  if (r === 'admin') return (staffBadgeType ?? 'admin').toLowerCase().trim() || 'admin';
  return null;
}

/** CP/BCP frame a relationship unlocks; seat left/right wings are display variants of these. */
export function relationshipFrameSlugs(typeCode: string, isRank1: boolean): string[] {
  const t = typeCode.toLowerCase();
  if (t !== 'cp' && t !== 'bcp') return [];
  return isRank1 ? [`rel_frame_${t}_normal`, `rel_frame_${t}_rank1`] : [`rel_frame_${t}_normal`];
}

/** Every frame this user may wear right now, with where it came from. */
export function eligibleFrames(input: EligibilityInput): Map<string, FrameSource> {
  const now = (input.now ?? new Date()).getTime();
  const out = new Map<string, FrameSource>();
  const byId = new Map(input.frames.map((f) => [f.id.toString(), f]));

  for (const u of input.unlocks) {
    if (u.expiresAt && u.expiresAt.getTime() <= now) continue;
    const f = byId.get(u.frameId.toString());
    // Role and CP/BCP frames come from the role / relationship itself, never from an unlock row.
    if (!f || f.category === 'role' || f.category?.toUpperCase() === RELATIONSHIP) continue;
    // Reward frames count only from their real grant; an old shop/level row must not unlock them.
    if ((f.category === 'rocket' || f.category === 'rank') && !REWARD_UNLOCKS.has(u.unlockType ?? '')) continue;
    // C.S comes from the star flag below, never from an unlock row.
    if (f.category === 'special') continue;
    out.set(f.id.toString(), sourceOfUnlock(f.category, u));
  }

  if (input.isStarAccount) {
    for (const f of input.frames) {
      if (f.category === 'special') out.set(f.id.toString(), 'support');
    }
  }

  const key = staffRoleKey(input.role, input.staffBadgeType);
  if (key) {
    const keys = new Set([key]);
    if (input.role.toLowerCase() === 'admin') keys.add('admin').add('superadmin');
    for (const f of input.frames) {
      if (f.category === 'role' && keys.has((f.animationKey ?? '').toLowerCase())) out.set(f.id.toString(), 'role');
    }
  }

  for (const rel of input.relationships) {
    const slugs = new Set(relationshipFrameSlugs(rel.typeCode, rel.isRank1));
    for (const f of input.frames) {
      if (f.slug && slugs.has(f.slug)) out.set(f.id.toString(), rel.typeCode.toLowerCase() as FrameSource);
    }
  }
  return out;
}

function sourceOfUnlock(
  category: string | null,
  u: { coinsPaid: number; unlockType: string | null },
): FrameSource {
  if (category === 'rocket') return 'rocket';
  if (category === 'rank') return 'rank';
  if (category === 'special') return 'support';
  return u.unlockType === 'level' && u.coinsPaid === 0 ? 'free' : 'paid';
}

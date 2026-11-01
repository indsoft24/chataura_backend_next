/** A code typed after signup only counts for a fresh account; old accounts can't be farmed with it. */
export const REFERRAL_APPLY_DAYS = 7;

export function withinReferralWindow(createdAt: Date, now = new Date()): boolean {
  return now.getTime() - createdAt.getTime() <= REFERRAL_APPLY_DAYS * 86_400_000;
}

/** The inviter must be a live account: not deleted, suspended or banned. */
export function referrerIsActive(u: { deletedAt: Date | null; accountStatus: string | null; isSuspended: boolean }): boolean {
  return !u.deletedAt && !u.isSuspended && u.accountStatus !== 'deleted' && u.accountStatus !== 'suspended';
}

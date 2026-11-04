/** A code typed after signup only counts for a fresh account; old accounts can't be farmed with it. */
export const REFERRAL_APPLY_DAYS = 7;

export function withinReferralWindow(createdAt: Date, now = new Date()): boolean {
  return now.getTime() - createdAt.getTime() <= REFERRAL_APPLY_DAYS * 86_400_000;
}

/** The inviter must be a live account: not deleted, suspended or banned. */
export function referrerIsActive(u: { deletedAt: Date | null; accountStatus: string | null; isSuspended: boolean }): boolean {
  return !u.deletedAt && !u.isSuspended && u.accountStatus !== 'deleted' && u.accountStatus !== 'suspended';
}

export type ReferralCheck = 'ok' | 'device' | 'late' | 'referrer';

/** What the app is told when an invite does not pay, so the user is never left guessing. */
export const REFERRAL_REJECTIONS: Record<Exclude<ReferralCheck, 'ok'>, { code: string; message: string }> = {
  device: { code: 'REFERRAL_NOT_ELIGIBLE', message: 'Referral rewards are only for the first account on a phone' },
  late: { code: 'REFERRAL_TOO_LATE', message: `A referral code can only be added within ${REFERRAL_APPLY_DAYS} days of signing up` },
  referrer: { code: 'INVALID_CODE', message: 'This invite code is no longer active' },
};

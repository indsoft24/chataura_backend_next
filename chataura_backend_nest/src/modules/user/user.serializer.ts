import { User } from '@prisma/client';

/** Serialize User for Android-compatible API payloads. */
export function userForApi(user: User): Record<string, unknown> {
  return {
    id: Number(user.id),
    user_id: Number(user.id),
    email: user.email,
    phone: user.phone,
    name: user.name ?? user.displayName,
    display_name: user.displayName ?? user.name,
    avatar: user.avatarUrl,
    avatar_url: user.avatarUrl,
    bio: user.bio,
    gender: user.gender,
    dob: user.dob ? user.dob.toISOString().slice(0, 10) : null,
    language: user.language,
    country: user.country,
    role: user.role,
    invite_code: user.inviteCode,
    referral_code: user.inviteCode,
    email_verified_at: user.emailVerifiedAt?.toISOString() ?? null,
    level: user.level,
    exp: user.exp,
    xp: user.xp ?? user.exp,
    coins: Number(user.coinBalance),
    coin_balance: Number(user.coinBalance),
    wallet_balance: Number(user.walletBalance),
    referral_balance: Number(user.referralBalance),
    gems: Number(user.gems),
    inr_earnings_balance: Number(user.inrEarningsBalance),
    usd_earnings_balance: Number(user.usdEarningsBalance),
    private_account: user.privateAccount,
    is_private: user.isPrivate || user.privateAccount,
    show_online_status: user.showOnlineStatus,
    is_online: user.isOnline,
    last_seen_at: user.lastSeenAt?.toISOString() ?? null,
    account_status: user.accountStatus,
    is_star_account: user.isStarAccount,
    star_rank: user.starRank,
    star_bio_tag: user.starBioTag,
    audio_call_rate: user.audioCallRate,
    video_call_rate: user.videoCallRate,
    selected_frame_id: user.selectedFrameId
      ? Number(user.selectedFrameId)
      : null,
    created_at: user.createdAt.toISOString(),
  };
}

export function profileForApi(
  user: User,
  counts: {
    friends: number;
    followers: number;
    following: number;
    friendRequests: number;
  },
): Record<string, unknown> {
  return {
    ...userForApi(user),
    friends_count: counts.friends,
    followers_count: counts.followers,
    following_count: counts.following,
    friend_requests_count: counts.friendRequests,
    fans_count: counts.followers,
  };
}

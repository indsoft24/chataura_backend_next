import { User } from '@prisma/client';
import {
  selectedFrameClientFields,
  type FrameAsset,
} from '../../common/utils/catalog-media';

/** Serialize User for Android-compatible API payloads. */
export function userForApi(
  user: User,
  frame?: FrameAsset | null,
): Record<string, unknown> {
  const selected = frame ?? null;
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
    xp: user.xp !== null && user.xp !== undefined ? Number(user.xp) : user.exp,
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
    ...selectedFrameClientFields(selected),
    created_at: user.createdAt.toISOString(),
  };
}

export function profileForApi(
  user: User & { selectedFrame?: FrameAsset | null },
  counts: {
    friends: number;
    followers: number;
    following: number;
    friendRequests: number;
  },
  band?: {
    level: number;
    minXp: number;
    maxXp: number;
    label: string;
    xpProgressPct: number;
  },
): Record<string, unknown> {
  const wallet = Number(user.walletBalance);
  const xp = Number(user.xp);
  return {
    ...userForApi(user, user.selectedFrame),
    coins: wallet,
    friends_count: counts.friends,
    followers_count: counts.followers,
    following_count: counts.following,
    friend_requests_count: counts.friendRequests,
    fans_count: counts.followers,
    ...(band
      ? {
          level: band.level,
          level_label: band.label,
          label: band.label,
          xp,
          exp: xp,
          level_min_xp: band.minXp,
          level_max_xp: band.maxXp,
          xp_progress_pct: band.xpProgressPct,
        }
      : {}),
  };
}

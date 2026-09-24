import { User } from '@prisma/client';
import {
  presentFrameMedia,
  selectedFrameClientFields,
  type FrameAsset,
} from '../../common/utils/catalog-media';

type RoleBadgeUser = Pick<User, 'role' | 'country'> & {
  staffBadgeType?: string | null;
};

const STAFF_BADGE_LABELS: Record<string, string> = {
  ceo: 'CEO',
  manager: 'Manager',
  admin: 'Admin',
  superadmin: 'Superadmin',
};

/** Map user role / staff badge into Android RoleBadgeDto fields. */
export function buildRoleBadge(
  user: RoleBadgeUser,
  roleFrame?: FrameAsset | null,
): {
  type: string;
  country: string | null;
  label: string;
  frame: Record<string, unknown> | null;
} | null {
  const role = String(user.role ?? '').toLowerCase();
  let type: string | null = null;
  let label: string | null = null;

  if (role === 'agency') {
    type = 'agency';
    label = 'Agency';
  } else if (role === 'seller') {
    type = 'coin_seller';
    label = 'Coin Seller';
  } else if (role === 'admin') {
    const badge = (user.staffBadgeType ?? 'admin').toLowerCase().trim();
    type = badge || 'admin';
    label = STAFF_BADGE_LABELS[type] ?? type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  if (!type || !label) return null;

  return {
    type,
    country: user.country ?? null,
    label,
    frame: serializeRoleFrame(roleFrame),
  };
}

function serializeRoleFrame(
  frame: FrameAsset | null | undefined,
): Record<string, unknown> | null {
  if (!frame) return null;
  const media = presentFrameMedia(
    frame.imageUrl,
    frame.animationUrl,
    frame.compositeMode,
  );
  return {
    animation_url: media.animation_url,
    animation_url_lite: media.animation_url_lite,
    preview_url: media.preview_url,
    media_type: media.media_type,
    loop: media.loop,
    composite: media.composite,
  };
}

function roleFrameClientFields(frame: FrameAsset | null | undefined) {
  if (!frame) {
    return {
      role_frame: null as Record<string, unknown> | null,
      role_frame_url: null as string | null,
      role_frame_url_lite: null as string | null,
      role_frame_url_hq: null as string | null,
    };
  }
  const media = presentFrameMedia(
    frame.imageUrl,
    frame.animationUrl,
    frame.compositeMode,
  );
  const serialized = serializeRoleFrame(frame);
  return {
    role_frame: serialized,
    role_frame_url: media.animation_url,
    role_frame_url_lite: media.animation_url_lite,
    role_frame_url_hq: media.animation_url,
  };
}

type UserWithRoleFrame = User & {
  selectedRoleFrame?: FrameAsset | null;
  staffBadgeType?: string | null;
};

/** Serialize User for Android-compatible API payloads. */
export function userForApi(
  user: UserWithRoleFrame,
  frame?: FrameAsset | null,
  roleFrame?: FrameAsset | null,
): Record<string, unknown> {
  const selected = frame ?? null;
  const resolvedRoleFrame =
    roleFrame ?? user.selectedRoleFrame ?? null;
  const badge = buildRoleBadge(user, resolvedRoleFrame);
  const roleMedia = roleFrameClientFields(resolvedRoleFrame);
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
    staff_badge_type: user.staffBadgeType ?? null,
    selected_frame_id: user.selectedFrameId
      ? Number(user.selectedFrameId)
      : null,
    selected_role_frame_id: user.selectedRoleFrameId
      ? Number(user.selectedRoleFrameId)
      : null,
    ...selectedFrameClientFields(selected),
    role_badge: badge,
    role_badge_type: badge?.type ?? null,
    role_badge_label: badge?.label ?? null,
    ...roleMedia,
    created_at: user.createdAt.toISOString(),
  };
}

export function profileForApi(
  user: UserWithRoleFrame & { selectedFrame?: FrameAsset | null },
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
    ...userForApi(user, user.selectedFrame, user.selectedRoleFrame),
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

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { basename, resolve } from 'path';
import { pipeline } from 'stream/promises';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LedgerService } from '../wallet/ledger.service';
import {
  bandForXp,
  ensureLaravelLevelBands,
} from '../gamification/level-bands';
import { profileForApi, userForApi } from './user.serializer';
import { selectedFrameClientFields } from '../../common/utils/catalog-media';

const PUBLIC_BASE =
  process.env.PUBLIC_BASE_URL?.replace(/\/$/, '') ?? 'http://localhost:3000';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  async invite(userId: bigint) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const totalInvited = await this.prisma.user.count({
      where: { invitedBy: userId },
    });
    const code = user.inviteCode ?? '';
    return {
      invite_code: code,
      invite_link: `${PUBLIC_BASE}/invite/${code}`,
      referral_register_url: `${PUBLIC_BASE}/${(process.env.API_PREFIX || 'api/v2').replace(/^\/+|\/+$/g, '')}/auth/register?invite_code=${code}`,
      reward_rules: { signup_bonus: 50 },
      total_invited: totalInvited,
      total_earned_coins: Number(user.referralBalance),
      referral_milestone: {
        enabled: true,
        required_count: 5,
        bonus_coins: 100,
        current_count: totalInvited,
      },
    };
  }

  async applyInvite(userId: bigint, rawCode: string) {
    const code = rawCode.trim();
    if (!code) {
      throw new BadRequestException({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'invite_code is required' },
      });
    }

    const settings = await this.prisma.adminSetting.findUnique({
      where: { id: 1 },
    });
    const extra = (settings?.extraSettings as Record<string, unknown>) ?? {};
    const referee = Number(
      extra.referral_reward_referee ?? process.env.REFERRAL_REWARD_REFEREE ?? '50',
    );
    const referrerAmt = Number(
      extra.referral_reward_referrer ??
        process.env.REFERRAL_REWARD_REFERRER ??
        '100',
    );

    return this.prisma.$transaction(async (tx) => {
      const referrer = await tx.user.findUnique({
        where: { inviteCode: code },
      });
      if (!referrer) {
        throw new BadRequestException({
          success: false,
          error: { code: 'INVALID_CODE', message: 'Invalid invite code' },
        });
      }
      if (referrer.id === userId) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'INVALID_CODE',
            message: 'Cannot apply your own invite code',
          },
        });
      }

      // Lock both rows in deterministic ascending ID order
      const userMap = await this.ledger.lockUsers(tx, [userId, referrer.id]);

      const updated = await tx.user.updateMany({
        where: { id: userId, invitedBy: null },
        data: { invitedBy: referrer.id },
      });
      if (updated.count === 0) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'ALREADY_APPLIED',
            message: 'Invite code already applied',
          },
        });
      }

      if (referee > 0) {
        const refKey = `referral_join_${userId}`;
        const alreadyCredited = await tx.coinTransaction.findFirst({
          where: { userId, referenceId: refKey },
        });
        if (!alreadyCredited) {
          await this.ledger.creditCoins(
            tx,
            userId,
            referee,
            'REFERRAL_REFEREE',
            'Referral join bonus',
            refKey,
            userMap.get(userId.toString()),
            {
              source: 'referral',
              currency: 'coins',
              referrer_id: Number(referrer.id),
            },
          );
        }
      }

      if (referrerAmt > 0) {
        const refBonusKey = `ref_bonus_${userId}`;
        const alreadyCredited = await tx.coinTransaction.findFirst({
          where: { userId: referrer.id, referenceId: refBonusKey },
        });
        if (!alreadyCredited) {
          await this.ledger.creditCoins(
            tx,
            referrer.id,
            referrerAmt,
            'REFERRAL_REFERRER',
            'Referral invite bonus',
            refBonusKey,
            userMap.get(referrer.id.toString()),
            { source: 'referral', currency: 'coins', referee_id: Number(userId) },
          );
        }
      }

      const settings = await tx.adminSetting.findUnique({ where: { id: 1 } });
      const extra = (settings?.bonusConfig ?? {}) as {
        referral_milestone?: {
          enabled?: boolean;
          required_count?: number;
          coins?: number;
        };
      };
      const milestone = extra.referral_milestone ?? {};
      const required = milestone.required_count ?? 5;
      const milestoneCoins = milestone.coins ?? 100;
      const milestoneEnabled = milestone.enabled !== false;
      const invited = await tx.user.count({
        where: { invitedBy: referrer.id },
      });
      if (milestoneEnabled && invited >= required && milestoneCoins > 0) {
        const milestoneKey = 'referral_milestone';
        const existing = await tx.bonusClaim.findFirst({
          where: { userId: referrer.id, referenceKey: milestoneKey },
        });
        if (!existing) {
          await tx.bonusClaim.create({
            data: {
              userId: referrer.id,
              kind: 'referral_milestone',
              coins: milestoneCoins,
              referenceKey: milestoneKey,
              meta: { source: 'referral', invited },
            },
          });
          await this.ledger.creditCoins(
            tx,
            referrer.id,
            milestoneCoins,
            'REFERRAL_MILESTONE',
            'Referral milestone',
            milestoneKey,
            null,
            { source: 'referral', currency: 'coins', invited },
          );
        }
      }

      return {
        applied: true,
        invited_by: Number(referrer.id),
        invite_code: code,
        invitee_coins: referee,
        referrer_coins: referrerAmt,
      };
    });
  }

  async availability(userId: bigint) {
    const member = await this.prisma.roomMember.findFirst({
      where: { userId, isActive: true, room: { isLive: true } },
    });
    const inRoom = !!member;
    return {
      is_busy: inRoom,
      is_in_room: inRoom,
      can_start_call: false,
      can_join_room: !inRoom,
      active_call_id: null,
      active_room_id: member?.roomId ?? null,
    };
  }

  async me(userId: bigint) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        selectedFrame: true,
        selectedRoleFrame: true,
        selectedEntryBar: true,
      },
    });
    const counts = await this.countsFor(userId);
    return {
      ...userForApi(user, user.selectedFrame, user.selectedRoleFrame),
      ...counts,
    };
  }

  async profile(userId: bigint) {
    const bands = await ensureLaravelLevelBands(this.prisma);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { selectedFrame: true, selectedRoleFrame: true },
    });
    const counts = await this.rawCounts(userId);
    const band = bandForXp(Number(user.xp), bands);
    return profileForApi(user, counts, band);
  }

  async updateMe(
    userId: bigint,
    body: { display_name?: string; avatar_url?: string; country?: string },
  ) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(body.display_name !== undefined
          ? { displayName: body.display_name, name: body.display_name }
          : {}),
        ...(body.avatar_url !== undefined
          ? { avatarUrl: body.avatar_url }
          : {}),
        ...(body.country !== undefined ? { country: body.country } : {}),
      },
      include: { selectedFrame: true, selectedRoleFrame: true },
    });
    return userForApi(user, user.selectedFrame);
  }

  async saveAvatar(filename: string, stream: any): Promise<string | null> {
    try {
      const dir = resolve(process.cwd(), 'uploads');
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const cleanBase = basename(filename || 'avatar.jpg').replace(
        /[^a-zA-Z0-9._-]/g,
        '_',
      );
      const safe = `avatar_${Date.now()}_${cleanBase}`;
      const dest = resolve(dir, safe);
      if (!dest.startsWith(dir)) return null;
      await pipeline(stream, createWriteStream(dest));
      return `${PUBLIC_BASE}/uploads/${safe}`;
    } catch {
      return null;
    }
  }

  async updateProfile(
    userId: bigint,
    body?: {
      name?: string;
      country?: string;
      bio?: string;
      gender?: string;
      dob?: string;
      avatar_url?: string;
      show_online_status?: boolean | string;
      is_private?: boolean | string;
      audio_call_rate?: number | string;
      video_call_rate?: number | string;
    },
  ) {
    const b = body || {};
    const bool = (v: unknown) =>
      v === true || v === 'true' || v === '1' || v === 1;

    let dobDate: Date | undefined;
    if (b.dob) {
      const parsed = new Date(b.dob);
      if (!isNaN(parsed.getTime())) {
        dobDate = parsed;
      }
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(b.name !== undefined
          ? { name: b.name, displayName: b.name }
          : {}),
        ...(b.country !== undefined ? { country: b.country } : {}),
        ...(b.bio !== undefined ? { bio: b.bio } : {}),
        ...(b.gender !== undefined ? { gender: b.gender } : {}),
        ...(dobDate !== undefined ? { dob: dobDate } : {}),
        ...(b.avatar_url !== undefined ? { avatarUrl: b.avatar_url } : {}),
        ...(b.show_online_status !== undefined
          ? { showOnlineStatus: bool(b.show_online_status) }
          : {}),
        ...(b.is_private !== undefined
          ? {
              isPrivate: bool(b.is_private),
              privateAccount: bool(b.is_private),
            }
          : {}),
        ...(b.audio_call_rate !== undefined
          ? { audioCallRate: Number(b.audio_call_rate) }
          : {}),
        ...(b.video_call_rate !== undefined
          ? { videoCallRate: Number(b.video_call_rate) }
          : {}),
      },
    });
    return this.profile(user.id);
  }

  async privacy(
    userId: bigint,
    body: {
      private_account?: boolean;
      is_private?: boolean;
      show_online_status?: boolean;
    },
  ) {
    const isPrivate = body.is_private ?? body.private_account;
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(isPrivate !== undefined
          ? { isPrivate, privateAccount: isPrivate }
          : {}),
        ...(body.show_online_status !== undefined
          ? { showOnlineStatus: body.show_online_status }
          : {}),
      },
      include: { selectedFrame: true, selectedRoleFrame: true },
    });
    return userForApi(user, user.selectedFrame);
  }

  async notifications(
    userId: bigint,
    body: Record<string, boolean | undefined>,
  ) {
    void userId;
    void body;
    return {
      success: true,
      message: 'Notifications updated',
    };
  }

  async updateLanguage(userId: bigint, language: string) {
    const clean = String(language || 'en').trim().slice(0, 16);
    await this.prisma.user.update({
      where: { id: userId },
      data: { language: clean },
    });
    return {
      success: true,
      message: 'Language updated',
      language: clean,
    };
  }

  async privileges(viewerId: bigint, targetUserId: bigint) {
    void viewerId;
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!targetUser) {
      throw new NotFoundException({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });
    }

    const userLevel = targetUser.level;
    const defaultPrivileges = [
      {
        title: 'VIP Badge',
        description:
          'Displays verified VIP status badge on profile, party rooms, and chat',
        icon_identifier: 'ic_vip_badge',
        level_required: 1,
      },
      {
        title: 'Exclusive Frames',
        description:
          'Access to unlock and equip premium animated avatar frames',
        icon_identifier: 'ic_frame',
        level_required: 5,
      },
      {
        title: 'Room Entry Effect',
        description:
          'Special entrance banner animation when joining party voice rooms',
        icon_identifier: 'ic_entry_effect',
        level_required: 10,
      },
      {
        title: 'Seat Priority',
        description:
          'Priority seating and microphone privilege in live party rooms',
        icon_identifier: 'ic_seat_priority',
        level_required: 15,
      },
      {
        title: 'Star Chat Creator',
        description:
          'Ability to charge coins for 1-to-1 Star Chat consultations',
        icon_identifier: 'ic_star_creator',
        level_required: 20,
      },
      {
        title: 'Custom Room Themes',
        description:
          'Unlock and apply customized animated backgrounds in owned party rooms',
        icon_identifier: 'ic_theme',
        level_required: 25,
      },
    ];

    return defaultPrivileges.map((p) => ({
      title: p.title,
      description: p.description,
      icon_identifier: p.icon_identifier,
      is_unlocked: userLevel >= p.level_required,
    }));
  }

  async search(q: string, page = 1, limit = 20) {
    const take = Math.min(Math.max(limit, 1), 50);
    const skip = (Math.max(page, 1) - 1) * take;
    const trimmed = (q ?? '').trim();
    const orConditions: Prisma.UserWhereInput[] = [
      { name: { contains: trimmed, mode: 'insensitive' } },
      { displayName: { contains: trimmed, mode: 'insensitive' } },
      { email: { contains: trimmed, mode: 'insensitive' } },
      { inviteCode: { equals: trimmed, mode: 'insensitive' } },
    ];
    if (/^\d+$/.test(trimmed)) {
      try {
        orConditions.push({ id: BigInt(trimmed) });
      } catch {}
    }
    const users = await this.prisma.user.findMany({
      where: {
        accountStatus: 'active',
        deletedAt: null,
        OR: orConditions,
      },
      skip,
      take,
      orderBy: { id: 'desc' },
      include: { selectedFrame: true, selectedRoleFrame: true },
    });
    return users.map((user) => userForApi(user, user.selectedFrame));
  }

  async show(viewerId: bigint | null, targetId: bigint) {
    const user = await this.prisma.user.findFirst({
      where: { id: targetId, deletedAt: null },
      include: { selectedFrame: true, selectedRoleFrame: true },
    });
    if (!user) {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }

    const counts = await this.rawCounts(targetId);
    let isFollowing = false;
    let isFriend = false;
    let relationshipStatus = 'none';
    let isBlocked = false;
    let hasBlockedMe = false;
    let followRequestPending = false;

    if (viewerId) {
      const [follow, friendship, sentReq, recvReq, block, blockedBy] =
        await Promise.all([
          this.prisma.userFollower.findUnique({
            where: {
              followerId_followingId: {
                followerId: viewerId,
                followingId: targetId,
              },
            },
          }),
          this.prisma.friendship.findFirst({
            where: {
              OR: [
                { userId: viewerId, friendId: targetId },
                { userId: targetId, friendId: viewerId },
              ],
            },
          }),
          this.prisma.friendRequest.findFirst({
            where: {
              senderId: viewerId,
              receiverId: targetId,
              status: 'pending',
            },
          }),
          this.prisma.friendRequest.findFirst({
            where: {
              senderId: targetId,
              receiverId: viewerId,
              status: 'pending',
            },
          }),
          this.prisma.blockedUser.findUnique({
            where: {
              blockerId_blockedId: { blockerId: viewerId, blockedId: targetId },
            },
          }),
          this.prisma.blockedUser.findUnique({
            where: {
              blockerId_blockedId: { blockerId: targetId, blockedId: viewerId },
            },
          }),
        ]);

      isFollowing = follow?.status === 'accepted';
      followRequestPending = follow?.status === 'pending';
      isFriend = !!friendship;
      if (isFriend) relationshipStatus = 'friends';
      else if (sentReq) relationshipStatus = 'request_sent';
      else if (recvReq) relationshipStatus = 'request_received';
      isBlocked = !!block;
      hasBlockedMe = !!blockedBy;
    }

    const privateLimited =
      (user.isPrivate || user.privateAccount) &&
      !isFriend &&
      !isFollowing &&
      viewerId !== targetId;

    return {
      ...userForApi(user, user.selectedFrame),
      friends_count: privateLimited ? 0 : counts.friends,
      followers_count: privateLimited ? 0 : counts.followers,
      following_count: privateLimited ? 0 : counts.following,
      is_following: isFollowing,
      isFollowing,
      is_friend: isFriend,
      isFriend,
      is_friend_request_sent: relationshipStatus === 'request_sent',
      relationship_status: relationshipStatus,
      friend_request_status: relationshipStatus,
      is_blocked: isBlocked,
      isBlocked,
      has_blocked_me: hasBlockedMe,
      hasBlockedMe,
      follow_request_pending: followRequestPending,
      private_profile_limited: privateLimited,
      is_private: user.isPrivate || user.privateAccount,
    };
  }

  async follow(viewerId: bigint, targetId: bigint) {
    if (viewerId === targetId) {
      throw new BadRequestException({
        success: false,
        error: { code: 'INVALID', message: 'Cannot follow yourself' },
      });
    }
    const target = await this.requireUser(targetId);
    const isFriend = await this.areFriends(viewerId, targetId);
    const status =
      target.isPrivate || target.privateAccount
        ? isFriend
          ? 'accepted'
          : 'pending'
        : 'accepted';

    await this.prisma.userFollower.upsert({
      where: {
        followerId_followingId: {
          followerId: viewerId,
          followingId: targetId,
        },
      },
      create: { followerId: viewerId, followingId: targetId, status },
      update: { status },
    });

    return {
      message: status === 'pending' ? 'Follow request sent' : 'Followed',
      follow_request_pending: status === 'pending',
    };
  }

  async unfollow(viewerId: bigint, targetId: bigint) {
    await this.prisma.userFollower.deleteMany({
      where: { followerId: viewerId, followingId: targetId },
    });
    return { message: 'Unfollowed' };
  }

  async addFriend(viewerId: bigint, targetId: bigint) {
    if (viewerId === targetId) {
      throw new BadRequestException({
        success: false,
        error: { code: 'INVALID', message: 'Cannot friend yourself' },
      });
    }
    await this.requireUser(targetId);

    const existingFriendship = await this.areFriends(viewerId, targetId);
    if (existingFriendship) {
      return { success: true, status: 'friends', _raw: true };
    }

    const incoming = await this.prisma.friendRequest.findFirst({
      where: {
        senderId: targetId,
        receiverId: viewerId,
        status: 'pending',
      },
    });
    if (incoming) {
      await this.acceptFriend(viewerId, targetId);
      return { success: true, status: 'request_received', _raw: true };
    }

    await this.prisma.friendRequest.upsert({
      where: {
        senderId_receiverId: { senderId: viewerId, receiverId: targetId },
      },
      create: {
        senderId: viewerId,
        receiverId: targetId,
        status: 'pending',
      },
      update: { status: 'pending' },
    });

    return { success: true, status: 'request_sent', _raw: true };
  }

  async acceptFriend(viewerId: bigint, otherId: bigint) {
    const [firstId, secondId] =
      viewerId < otherId ? [viewerId, otherId] : [otherId, viewerId];

    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.friendRequest.updateMany({
        where: {
          OR: [
            { senderId: otherId, receiverId: viewerId, status: 'pending' },
            { senderId: viewerId, receiverId: otherId, status: 'pending' },
          ],
        },
        data: { status: 'accepted' },
      });

      if (claim.count === 0) {
        const existingFriendship = await tx.friendship.findUnique({
          where: { userId_friendId: { userId: viewerId, friendId: otherId } },
        });
        if (existingFriendship) {
          return { message: 'Friend request accepted' };
        }
        throw new BadRequestException({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Friend request not found' },
        });
      }

      await tx.friendship.upsert({
        where: {
          userId_friendId: { userId: firstId, friendId: secondId },
        },
        create: { userId: firstId, friendId: secondId },
        update: {},
      });
      await tx.friendship.upsert({
        where: {
          userId_friendId: { userId: secondId, friendId: firstId },
        },
        create: { userId: secondId, friendId: firstId },
        update: {},
      });

      return { message: 'Friend request accepted' };
    });
  }

  async rejectFriend(viewerId: bigint, otherId: bigint) {
    await this.prisma.friendRequest.updateMany({
      where: {
        senderId: otherId,
        receiverId: viewerId,
        status: 'pending',
      },
      data: { status: 'rejected' },
    });
    return { message: 'Friend request rejected' };
  }

  async cancelFriendRequest(viewerId: bigint, otherId: bigint) {
    await this.prisma.friendRequest.updateMany({
      where: {
        senderId: viewerId,
        receiverId: otherId,
        status: 'pending',
      },
      data: { status: 'cancelled' },
    });
    return { message: 'Friend request cancelled' };
  }

  async unfriend(viewerId: bigint, otherId: bigint) {
    await this.prisma.friendship.deleteMany({
      where: {
        OR: [
          { userId: viewerId, friendId: otherId },
          { userId: otherId, friendId: viewerId },
        ],
      },
    });
    return { message: 'Unfriended' };
  }

  async friendRequests(userId: bigint, page = 1, limit = 20) {
    const take = Math.min(Math.max(limit, 1), 50);
    const skip = (Math.max(page, 1) - 1) * take;
    const rows = await this.prisma.friendRequest.findMany({
      where: { receiverId: userId, status: 'pending' },
      include: { sender: true },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: Number(r.id),
      user_id: Number(r.senderId),
      name: r.sender.displayName ?? r.sender.name,
      avatar: r.sender.avatarUrl,
      avatar_url: r.sender.avatarUrl,
      level: r.sender.level,
    }));
  }

  async friendRequestsCount(userId: bigint) {
    const count = await this.prisma.friendRequest.count({
      where: { receiverId: userId, status: 'pending' },
    });
    return { count };
  }

  async followers(userId: bigint, page = 1, limit = 20) {
    const take = Math.min(Math.max(limit, 1), 50);
    const skip = (Math.max(page, 1) - 1) * take;
    const rows = await this.prisma.userFollower.findMany({
      where: { followingId: userId, status: 'accepted' },
      include: { follower: { include: { selectedFrame: true, selectedRoleFrame: true } } },
      skip,
      take,
    });
    return rows.map((r) => userForApi(r.follower, r.follower.selectedFrame));
  }

  async following(userId: bigint, page = 1, limit = 20) {
    const take = Math.min(Math.max(limit, 1), 50);
    const skip = (Math.max(page, 1) - 1) * take;
    const rows = await this.prisma.userFollower.findMany({
      where: { followerId: userId, status: 'accepted' },
      include: { following: { include: { selectedFrame: true, selectedRoleFrame: true } } },
      skip,
      take,
    });
    return rows.map((r) => userForApi(r.following, r.following.selectedFrame));
  }

  async friends(userId: bigint, page = 1, limit = 20) {
    const take = Math.min(Math.max(limit, 1), 50);
    const skip = (Math.max(page, 1) - 1) * take;
    const rows = await this.prisma.friendship.findMany({
      where: { userId },
      include: { friend: { include: { selectedFrame: true, selectedRoleFrame: true } } },
      skip,
      take,
    });
    return rows.map((r) => ({
      id: Number(r.friend.id),
      name: r.friend.displayName ?? r.friend.name,
      avatar_url: r.friend.avatarUrl,
      is_online: r.friend.isOnline,
      last_seen_at: r.friend.lastSeenAt?.toISOString() ?? null,
      selected_frame_id: r.friend.selectedFrameId
        ? Number(r.friend.selectedFrameId)
        : null,
      ...selectedFrameClientFields(r.friend.selectedFrame),
    }));
  }

  async block(viewerId: bigint, targetId: bigint) {
    if (viewerId === targetId) {
      throw new BadRequestException({
        success: false,
        error: { code: 'INVALID', message: 'Cannot block yourself' },
      });
    }
    await this.requireUser(targetId);
    await this.prisma.blockedUser.upsert({
      where: {
        blockerId_blockedId: { blockerId: viewerId, blockedId: targetId },
      },
      create: { blockerId: viewerId, blockedId: targetId },
      update: {},
    });
    await this.prisma.friendship.deleteMany({
      where: {
        OR: [
          { userId: viewerId, friendId: targetId },
          { userId: targetId, friendId: viewerId },
        ],
      },
    });
    await this.prisma.userFollower.deleteMany({
      where: {
        OR: [
          { followerId: viewerId, followingId: targetId },
          { followerId: targetId, followingId: viewerId },
        ],
      },
    });
    return { message: 'User blocked' };
  }

  async unblock(viewerId: bigint, targetId: bigint) {
    await this.prisma.blockedUser.deleteMany({
      where: { blockerId: viewerId, blockedId: targetId },
    });
    return { message: 'User unblocked' };
  }

  async blockedUsers(userId: bigint) {
    const rows = await this.prisma.blockedUser.findMany({
      where: { blockerId: userId },
      include: { blocked: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: Number(r.blocked.id),
      name: r.blocked.displayName ?? r.blocked.name,
      avatar_url: r.blocked.avatarUrl,
    }));
  }

  async registerDevice(
    userId: bigint,
    body: { device_id?: string; platform?: string; fcm_token?: string },
  ) {
    if (body.fcm_token) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { fcmToken: body.fcm_token },
      });
    }
    await this.prisma.userDevice.create({
      data: {
        userId,
        deviceId: body.device_id ?? null,
        platform: body.platform ?? null,
        fcmToken: body.fcm_token ?? null,
      },
    });
    return { message: 'Device registered' };
  }

  async updateFcmToken(userId: bigint, fcmToken: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { fcmToken },
    });
    return { message: 'FCM token updated' };
  }

  async starAccounts(page = 1, limit = 20) {
    const take = Math.min(Math.max(limit, 1), 50);
    const skip = (Math.max(page, 1) - 1) * take;
    const users = await this.prisma.user.findMany({
      where: { isStarAccount: true, accountStatus: 'active', deletedAt: null },
      include: { selectedFrame: true, selectedRoleFrame: true },
      orderBy: [{ starRank: 'asc' }, { id: 'desc' }],
      skip,
      take,
    });
    return users.map((u) => ({
      id: Number(u.id),
      name: u.displayName ?? u.name,
      avatar_url: u.avatarUrl,
      level: u.level,
      is_online: u.isOnline,
      country: u.country,
      selected_frame_id: u.selectedFrameId ? Number(u.selectedFrameId) : null,
      ...selectedFrameClientFields(u.selectedFrame),
      star_rank: u.starRank,
      star_bio_tag: u.starBioTag,
      audio_call_rate: u.audioCallRate,
      video_call_rate: u.videoCallRate,
    }));
  }

  async starAccount(userId: bigint) {
    const u = await this.prisma.user.findFirst({
      where: { id: userId, isStarAccount: true, deletedAt: null },
      include: { selectedFrame: true, selectedRoleFrame: true },
    });
    if (!u) {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Star account not found' },
      });
    }
    return {
      id: Number(u.id),
      name: u.displayName ?? u.name,
      avatar_url: u.avatarUrl,
      level: u.level,
      is_online: u.isOnline,
      country: u.country,
      selected_frame_id: u.selectedFrameId ? Number(u.selectedFrameId) : null,
      ...selectedFrameClientFields(u.selectedFrame),
      star_rank: u.starRank,
      star_bio_tag: u.starBioTag,
      audio_call_rate: u.audioCallRate,
      video_call_rate: u.videoCallRate,
    };
  }

  async report(
    reporterId: bigint,
    reportedId: bigint,
    reason: string,
    description?: string,
  ) {
    const allowed = [
      'SPAM',
      'HARASSMENT',
      'INAPPROPRIATE_CONTENT',
      'HATE_SPEECH',
      'NUDITY_OR_SEXUAL_CONTENT',
      'OTHER',
    ];
    if (!allowed.includes(reason)) {
      throw new BadRequestException({
        success: false,
        error: { code: 'INVALID_REASON', message: 'Invalid report reason' },
      });
    }
    await this.requireUser(reportedId);
    await this.prisma.userReport.create({
      data: {
        reporterId,
        reportedId,
        reason,
        description: description ?? null,
      },
    });
    return { message: 'Report submitted' };
  }

  reportReasons() {
    return [
      'SPAM',
      'HARASSMENT',
      'INAPPROPRIATE_CONTENT',
      'HATE_SPEECH',
      'NUDITY_OR_SEXUAL_CONTENT',
      'OTHER',
    ];
  }

  async deleteAccount(userId: bigint) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        accountStatus: 'deleted',
        deletedAt: new Date(),
        email: `deleted_${userId}@deleted.local`,
        phone: null,
      },
    });
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
    return { message: 'Account deleted' };
  }

  private async requireUser(id: bigint) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null, accountStatus: { not: 'deleted' } },
    });
    if (!user) {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }
    return user;
  }

  async giftGallery(
    userId: bigint,
    page = 1,
    limit = 20,
    direction: 'received' | 'sent' = 'received',
  ) {
    const take = Math.min(Math.max(limit, 1), 50);
    const skip = (Math.max(page, 1) - 1) * take;
    const uidNum = Number(userId);
    const uidStr = String(userId);

    // Fetch a wide window of gift debits, then group in memory.
    // Prisma JSON path filters are unreliable across PG/MySQL for nested meta.
    const rows = await this.prisma.coinTransaction.findMany({
      where:
        direction === 'sent'
          ? { userId, type: { in: ['GIFT', 'gift'] }, coinAmount: { lt: 0 } }
          : { type: { in: ['GIFT', 'gift'] }, coinAmount: { lt: 0 } },
      orderBy: { id: 'desc' },
      take: 2000,
    });

    const grouped = new Map<
      string,
      {
        giftId: number;
        count: number;
        lastAt: Date;
      }
    >();
    for (const row of rows) {
      const meta = (row.meta ?? {}) as {
        gift_id?: number | string;
        quantity?: number | string;
        receiver_id?: number | string;
      };
      if (direction === 'received') {
        const rid = meta.receiver_id;
        if (rid === undefined || rid === null) continue;
        if (Number(rid) !== uidNum && String(rid) !== uidStr) continue;
      }
      const giftId = Number(meta.gift_id ?? 0);
      if (!giftId) continue;
      const prev = grouped.get(String(giftId));
      const qty = Number(meta.quantity ?? 1) || 1;
      grouped.set(String(giftId), {
        giftId,
        count: (prev?.count ?? 0) + qty,
        lastAt: prev?.lastAt ?? row.createdAt,
      });
    }
    const catalog = await this.prisma.gift.findMany();
    const byId = new Map(catalog.map((g) => [Number(g.id), g]));
    const gifts = [...grouped.values()]
      .sort((a, b) => b.count - a.count)
      .slice(skip, skip + take)
      .map((g) => {
        const item = byId.get(g.giftId);
        return {
          id: String(g.giftId),
          gift_id: String(g.giftId),
          name: item?.name ?? `Gift ${g.giftId}`,
          icon_url: item?.imageUrl ?? null,
          count_received: g.count,
          rarity: null,
          source: direction === 'sent' ? 'sent' : 'room',
          last_received_at: g.lastAt.toISOString(),
        };
      });
    return {
      total_gifts_collected: [...grouped.values()].reduce(
        (s, g) => s + g.count,
        0,
      ),
      max_gifts_available: catalog.length,
      gifts,
    };
  }

  private async areFriends(a: bigint, b: bigint) {
    const row = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { userId: a, friendId: b },
          { userId: b, friendId: a },
        ],
      },
    });
    return !!row;
  }

  private async rawCounts(userId: bigint) {
    const [friends, followers, following, friendRequests] = await Promise.all([
      this.prisma.friendship.count({ where: { userId } }),
      this.prisma.userFollower.count({
        where: { followingId: userId, status: 'accepted' },
      }),
      this.prisma.userFollower.count({
        where: { followerId: userId, status: 'accepted' },
      }),
      this.prisma.friendRequest.count({
        where: { receiverId: userId, status: 'pending' },
      }),
    ]);
    return { friends, followers, following, friendRequests };
  }

  private async countsFor(userId: bigint) {
    const c = await this.rawCounts(userId);
    return {
      friends_count: c.friends,
      followers_count: c.followers,
      following_count: c.following,
      friend_requests_count: c.friendRequests,
    };
  }
}

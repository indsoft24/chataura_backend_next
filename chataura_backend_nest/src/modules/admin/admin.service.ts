import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { bandForXp, ensureLaravelLevelBands } from '../gamification/level-bands';
import { userForApi } from '../user/user.serializer';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(period = 'weekly', fromStr?: string, toStr?: string) {
    const validPeriod = ['daily', 'weekly', 'monthly'].includes(period) ? period : 'weekly';
    const now = new Date();

    let to: Date;
    if (toStr) {
      to = new Date(toStr);
      to.setHours(23, 59, 59, 999);
    } else {
      to = new Date(now);
      to.setHours(23, 59, 59, 999);
    }

    let from: Date;
    if (fromStr) {
      from = new Date(fromStr);
      from.setHours(0, 0, 0, 0);
    } else {
      from = new Date(to);
      if (validPeriod === 'daily') {
        from.setHours(0, 0, 0, 0);
      } else if (validPeriod === 'monthly') {
        from.setDate(1);
        from.setHours(0, 0, 0, 0);
      } else {
        from.setDate(from.getDate() - 7);
        from.setHours(0, 0, 0, 0);
      }
    }

    if (from > to) {
      const temp = from;
      from = to;
      to = temp;
    }

    const durationDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
    const previousFrom = new Date(from.getTime() - durationDays * 24 * 60 * 60 * 1000);
    const previousTo = new Date(from.getTime() - 1);

    const todayStart = this.startOfDay();
    const weekAgoStart = this.startOfWeek();

    const [
      users,
      newUsersInRange,
      liveRooms,
      callsInRange,
      postsInRange,
      feedbackInRange,
      reportsInRange,
      giftsToday,
      rechargeToday,
      rechargeThisWeek,
      rechargeSelected,
      rechargePrevious,
      volumeSelected,
      volumePrevious,
      giftVolumeSelected,
      callVolumeSelected,
      adminCreditsSelected,
      gameVolumeSelected,
      gameWinVolumeSelected,
      purchasesByStatus,
      withdrawalsByStatus,
      starChatAgg,
      systemUser,
    ] = await Promise.all([
      this.prisma.user.count({ where: { accountStatus: 'active' } }),
      this.prisma.user.count({ where: { createdAt: { gte: from, lte: to } } }),
      this.prisma.room.count({ where: { isLive: true } }),
      this.prisma.starChatSession.count({ where: { startedAt: { gte: from, lte: to } } }),
      this.prisma.mediaItem.count({ where: { createdAt: { gte: from, lte: to } } }),
      this.prisma.feedback.count({ where: { createdAt: { gte: from, lte: to } } }),
      this.prisma.userReport.count({ where: { createdAt: { gte: from, lte: to } } }),
      this.prisma.coinTransaction.aggregate({
        where: { type: 'GIFT', createdAt: { gte: todayStart } },
        _sum: { coinAmount: true },
      }),
      this.prisma.coinPurchaseTransaction.aggregate({
        where: { status: 'success', createdAt: { gte: todayStart } },
        _sum: { coinsCredited: true, amountMinor: true },
      }),
      this.prisma.coinPurchaseTransaction.aggregate({
        where: { status: 'success', createdAt: { gte: weekAgoStart } },
        _sum: { coinsCredited: true, amountMinor: true },
      }),
      this.prisma.coinPurchaseTransaction.aggregate({
        where: { status: 'success', createdAt: { gte: from, lte: to } },
        _sum: { coinsCredited: true, amountMinor: true },
      }),
      this.prisma.coinPurchaseTransaction.aggregate({
        where: { status: 'success', createdAt: { gte: previousFrom, lte: previousTo } },
        _sum: { coinsCredited: true, amountMinor: true },
      }),
      this.prisma.coinTransaction.aggregate({
        where: { createdAt: { gte: from, lte: to } },
        _count: true,
        _sum: { coinAmount: true, netAmount: true, commissionAmount: true },
      }),
      this.prisma.coinTransaction.aggregate({
        where: { createdAt: { gte: previousFrom, lte: previousTo } },
        _sum: { coinAmount: true, commissionAmount: true },
      }),
      this.prisma.coinTransaction.aggregate({
        where: { type: 'GIFT', createdAt: { gte: from, lte: to } },
        _sum: { coinAmount: true },
      }),
      this.prisma.coinTransaction.aggregate({
        where: { type: 'STAR_CHAT', createdAt: { gte: from, lte: to } },
        _sum: { coinAmount: true },
      }),
      this.prisma.coinTransaction.aggregate({
        where: { type: { in: ['ADMIN_CREDIT', 'ADMIN_ADJUST', 'SELLER_TRANSFER'] }, createdAt: { gte: from, lte: to } },
        _sum: { coinAmount: true },
      }),
      this.prisma.coinTransaction.aggregate({
        where: { type: { in: ['GAME_LUCKY77', 'GAME_GREEDY', 'SPIN'] }, createdAt: { gte: from, lte: to } },
        _sum: { coinAmount: true },
      }),
      this.prisma.coinTransaction.aggregate({
        where: { type: { in: ['GAME_LUCKY77_WIN', 'GAME_GREEDY_WIN', 'SPIN_WIN'] }, createdAt: { gte: from, lte: to } },
        _sum: { coinAmount: true },
      }),
      this.prisma.coinPurchaseTransaction.groupBy({
        by: ['status'],
        where: { createdAt: { gte: from, lte: to } },
        _count: true,
        _sum: { coinsCredited: true, amountMinor: true },
      }),
      this.prisma.withdrawalRequest.groupBy({
        by: ['status'],
        where: { createdAt: { gte: from, lte: to } },
        _count: true,
        _sum: { amount: true },
      }),
      this.prisma.starChatSession.aggregate({
        where: { startedAt: { gte: from, lte: to } },
        _count: true,
        _sum: { coinsCharged: true, gemsCredited: true },
      }),
      this.prisma.user.findFirst({
        where: { role: 'admin' },
        select: { id: true, name: true, displayName: true, email: true, walletBalance: true, coinBalance: true },
      }),
    ]);

    const curRev = (rechargeSelected._sum.amountMinor ?? 0) / 100;
    const prevRev = (rechargePrevious._sum.amountMinor ?? 0) / 100;
    const revenueGrowthPercent = prevRev > 0
      ? Number((((curRev - prevRev) / prevRev) * 100).toFixed(2))
      : (curRev > 0 ? 100.0 : 0.0);

    const curComm = Number(volumeSelected._sum.commissionAmount ?? 0n);
    const prevComm = Number(volumePrevious._sum.commissionAmount ?? 0n);
    const commissionGrowthPercent = prevComm > 0
      ? Number((((curComm - prevComm) / prevComm) * 100).toFixed(2))
      : (curComm > 0 ? 100.0 : 0.0);

    // Commission trend by day
    const commissionByDayRaw = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT 
        TO_CHAR(created_at, 'YYYY-MM-DD') as bucket,
        COUNT(*)::int as tx_count,
        COALESCE(SUM(commission_amount), 0)::bigint as commission,
        COALESCE(SUM(coin_amount), 0)::bigint as gross_volume
      FROM coin_transactions
      WHERE created_at >= $1 AND created_at <= $2
      GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD')
      ORDER BY bucket ASC;
    `, from, to);

    const commissionByDay = commissionByDayRaw.map((r) => ({
      bucket: r.bucket,
      tx_count: Number(r.tx_count),
      commission: Number(r.commission),
      gross_volume: Number(r.gross_volume),
    }));

    // Top users by commission
    const topUsersRaw = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT 
        u.id as user_id, 
        COALESCE(u.display_name, u.name, CONCAT('User #', u.id)) as user_name, 
        u.email as user_email, 
        u.avatar_url, 
        COUNT(*)::int as tx_count, 
        COALESCE(SUM(t.commission_amount), 0)::bigint as commission_total
      FROM coin_transactions t
      JOIN users u ON u.id = t.user_id
      WHERE t.created_at >= $1 AND t.created_at <= $2
      GROUP BY u.id, u.display_name, u.name, u.email, u.avatar_url
      ORDER BY commission_total DESC, tx_count DESC
      LIMIT 10;
    `, from, to);

    const topUsersByCommission = topUsersRaw.map((u, idx) => ({
      rank: idx + 1,
      user_id: Number(u.user_id),
      user_name: u.user_name,
      user_email: u.user_email,
      avatar_url: u.avatar_url,
      tx_count: Number(u.tx_count),
      commission_total: Number(u.commission_total),
    }));

    const rechargePurchases = purchasesByStatus.map((p) => ({
      status: String(p.status).toLowerCase(),
      tx_count: p._count,
      total_coins: p._sum.coinsCredited ?? 0,
      total_amount: (p._sum.amountMinor ?? 0) / 100,
    }));

    const withdrawals = withdrawalsByStatus.map((w) => ({
      status: String(w.status).toLowerCase(),
      request_count: w._count,
      total_gems: Number(w._sum.amount ?? 0n),
    }));

    return {
      period: validPeriod,
      from: from.toISOString().split('T')[0],
      to: to.toISOString().split('T')[0],
      overview: {
        total_users: users,
        new_users_in_range: newUsersInRange,
        active_rooms: liveRooms,
        calls_in_range: callsInRange,
        content_posts_in_range: postsInRange,
        feedback_in_range: feedbackInRange,
        reports_in_range: reportsInRange,
      },
      revenue: {
        today: (rechargeToday._sum.amountMinor ?? 0) / 100,
        this_week: (rechargeThisWeek._sum.amountMinor ?? 0) / 100,
        current_period: curRev,
        previous_period: prevRev,
        growth_percent: revenueGrowthPercent,
      },
      commission: {
        current_period: curComm,
        previous_period: prevComm,
        growth_percent: commissionGrowthPercent,
      },
      finance: {
        tx_count: volumeSelected._count,
        gross_volume: Number(volumeSelected._sum.coinAmount ?? 0n),
        net_volume: Number(volumeSelected._sum.netAmount ?? 0n),
        commission: curComm,
        gift_volume: Number(giftVolumeSelected._sum.coinAmount ?? 0n),
        call_volume: Number(callVolumeSelected._sum.coinAmount ?? 0n),
        admin_credit_volume: Number(adminCreditsSelected._sum.coinAmount ?? 0n),
        game_volume: Number(gameVolumeSelected._sum.coinAmount ?? 0n),
        game_win_volume: Number(gameWinVolumeSelected._sum.coinAmount ?? 0n),
      },
      callCommission: {
        total_calls: starChatAgg._count ?? 0,
        caller_charged: Number(starChatAgg._sum?.coinsCharged ?? 0n),
        creator_paid: Number(starChatAgg._sum?.gemsCredited ?? 0n),
        platform_commission_accrued: Math.max(0, Number(starChatAgg._sum?.coinsCharged ?? 0n) - Number(starChatAgg._sum?.gemsCredited ?? 0n)),
      },
      systemUser: systemUser
        ? {
            id: Number(systemUser.id),
            name: systemUser.displayName ?? systemUser.name,
            email: systemUser.email,
            wallet_balance: Number(systemUser.walletBalance),
            coin_balance: Number(systemUser.coinBalance),
          }
        : null,
      commissionByDay,
      topUsersByCommission,
      recharge: {
        coin_purchase: rechargePurchases,
      },
      withdrawals,
      // Backward compatibility with legacy shape
      users,
      live_rooms: liveRooms,
      coin_burn_today: Number(giftsToday._sum.coinAmount ?? 0n),
      recharge_today: rechargeToday._sum.coinsCredited ?? 0,
      revenue_today: (rechargeToday._sum.amountMinor ?? 0) / 100,
      revenue_this_week: (rechargeThisWeek._sum.amountMinor ?? 0) / 100,
      coin_tx_count: volumeSelected._count,
      gross_volume: Number(volumeSelected._sum.coinAmount ?? 0n),
      net_volume: Number(volumeSelected._sum.netAmount ?? 0n),
      commission_total: curComm,
      gift_volume: Number(giftVolumeSelected._sum.coinAmount ?? 0n),
      admin_credits: Number(adminCreditsSelected._sum.coinAmount ?? 0n),
      reports: reportsInRange,
      pending_withdrawals: withdrawals.find((w) => w.status === 'pending')?.request_count ?? 0,
      recent_commissions: commissionByDay.slice(-7).map((c) => ({
        date: c.bucket,
        transactions: c.tx_count,
        commission: c.commission,
      })),
    };
  }

  async users(q?: string, page = 1, limit = 20) {
    const take = Math.min(Math.max(limit, 1), 50);
    const skip = (Math.max(page, 1) - 1) * take;
    const where = q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' as const } },
            { displayName: { contains: q, mode: 'insensitive' as const } },
            { name: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { id: 'desc' },
      }),
    ]);
    return {
      users: rows.map((user) => userForApi(user)),
      total,
      page,
      limit: take,
      total_pages: Math.ceil(total / take),
      meta: {
        total,
        page,
        last_page: Math.max(1, Math.ceil(total / take)),
        limit: take,
      },
    };
  }

  async suspend(id: bigint, reason?: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }
    const u = await this.prisma.user.update({
      where: { id },
      data: { isSuspended: true, suspendedReason: reason ?? 'admin_suspend' },
    });
    return userForApi(u);
  }

  async unsuspend(id: bigint) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }
    const u = await this.prisma.user.update({
      where: { id },
      data: { isSuspended: false, suspendedReason: null },
    });
    return userForApi(u);
  }

  async setStar(id: bigint, isStar: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }
    const u = await this.prisma.user.update({
      where: { id },
      data: { isStarAccount: isStar },
    });
    return userForApi(u);
  }

  async reports(page = 1, limit = 20) {
    const take = Math.min(Math.max(limit, 1), 50);
    const skip = (Math.max(page, 1) - 1) * take;
    const [total, rows] = await Promise.all([
      this.prisma.userReport.count(),
      this.prisma.userReport.findMany({
        skip,
        take,
        orderBy: { id: 'desc' },
        include: { reporter: true, reported: true },
      }),
    ]);
    return {
      total,
      page,
      limit: take,
      reports: rows.map((r) => ({
        id: Number(r.id),
        reason: r.reason,
        description: r.description,
        created_at: r.createdAt.toISOString(),
        reporter: {
          id: Number(r.reporter.id),
          name: r.reporter.displayName ?? r.reporter.name,
        },
        reported: {
          id: Number(r.reported.id),
          name: r.reported.displayName ?? r.reported.name,
        },
      })),
    };
  }

  async resolveReport(id: bigint) {
    await this.prisma.userReport.delete({ where: { id } });
    return { message: 'Report resolved and removed' };
  }

  async deactivate(id: bigint, reason?: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.room.updateMany({
        where: { OR: [{ ownerId: id }, { hostId: id }], isLive: true },
        data: { isLive: false, hostId: null, coHostId: null },
      });
      await tx.seat.updateMany({
        where: { userId: id },
        data: { userId: null, isMuted: false, mutedByUserId: null },
      });
      await tx.roomMember.updateMany({
        where: { userId: id, isActive: true },
        data: { isActive: false, seatIndex: null, role: 'listener' },
      });
      await tx.refreshToken.deleteMany({ where: { userId: id } });
      await tx.user.update({
        where: { id },
        data: {
          isSuspended: true,
          accountStatus: 'deleted',
          suspendedReason: reason ?? 'admin_deactivate',
          deletedAt: new Date(),
          isOnline: false,
          fcmToken: null,
        },
      });
    });
    return { message: 'User deactivated', user_id: Number(id) };
  }

  async linkExistingUser(
    userId: bigint,
    body: { role?: 'user' | 'seller' | 'admin'; email?: string },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        role: body.role ?? 'admin',
        ...(body.email ? { email: body.email } : {}),
        accountStatus: 'active',
        isSuspended: false,
        deletedAt: null,
      },
    });
    return userForApi(updated);
  }

  async staff() {
    const rows = await this.prisma.user.findMany({
      where: { role: { in: ['admin', 'seller'] }, deletedAt: null },
      orderBy: { id: 'asc' },
    });
    const today = this.startOfDay();
    const items = await Promise.all(
      rows.map(async (u) => {
        const [roomsHosted, giftsSent, recharges, usersBrought, usersBroughtToday] = await Promise.all([
          this.prisma.room.count({
            where: { hostId: u.id, createdAt: { gte: today } },
          }),
          this.prisma.coinTransaction.aggregate({
            where: {
              userId: u.id,
              type: 'GIFT',
              createdAt: { gte: today },
            },
            _sum: { coinAmount: true },
          }),
          this.prisma.coinPurchaseTransaction.aggregate({
            where: {
              userId: u.id,
              status: 'success',
              createdAt: { gte: today },
            },
            _sum: { coinsCredited: true },
          }),
          this.prisma.user.count({
            where: { invitedBy: u.id, deletedAt: null },
          }),
          this.prisma.user.count({
            where: { invitedBy: u.id, createdAt: { gte: today }, deletedAt: null },
          }),
        ]);
        return {
          ...userForApi(u),
          business: {
            users_brought: usersBrought,
            users_brought_today: usersBroughtToday,
            rooms_hosted_today: roomsHosted,
            gift_coins_today: Math.abs(Number(giftsSent._sum.coinAmount ?? 0n)),
            recharge_coins_today: recharges._sum.coinsCredited ?? 0,
          },
        };
      }),
    );
    return { staff: items };
  }

  async withdrawals() {
    const rows = await this.prisma.withdrawalRequest.findMany({
      include: { user: true },
      orderBy: { id: 'desc' },
      take: 50,
    });
    return {
      withdrawals: rows.map((w) => ({
        id: Number(w.id),
        amount: Number(w.amount),
        currency: w.currency,
        status: w.status,
        source: w.source,
        user: {
          id: Number(w.user.id),
          name: w.user.displayName ?? w.user.name,
        },
        created_at: w.createdAt.toISOString(),
      })),
    };
  }

  async approveWithdrawal(id: bigint) {
    const claim = await this.prisma.withdrawalRequest.updateMany({
      where: { id, status: 'pending' },
      data: { status: 'approved' },
    });
    if (claim.count === 0) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'WITHDRAWAL_NOT_PENDING',
          message: 'Withdrawal is not pending or already processed',
        },
      });
    }
    return { id: Number(id), status: 'approved' };
  }

  async rejectWithdrawal(id: bigint, reason?: string) {
    const claim = await this.prisma.withdrawalRequest.updateMany({
      where: { id, status: 'pending' },
      data: { status: 'rejected', note: reason ?? 'Rejected by admin' },
    });
    if (claim.count === 0) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'WITHDRAWAL_NOT_PENDING',
          message: 'Withdrawal is not pending or already processed',
        },
      });
    }
    return { id: Number(id), status: 'rejected' };
  }

  // ──────────────────────────────────────────────
  // Agencies
  // ──────────────────────────────────────────────

  async agencies(page = 1, limit = 20, status?: string) {
    const skip = (page - 1) * limit;
    const [agencyUsers, affiliations, totalAffiliations] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: 'agency', deletedAt: null },
        orderBy: { id: 'desc' },
      }),
      this.prisma.agencyAffiliation.findMany({
        where: status ? { status: status as any } : {},
        include: {
          agency: { select: { id: true, name: true, displayName: true, country: true } },
          roomOwner: { select: { id: true, name: true, displayName: true, country: true } },
          room: { select: { id: true, title: true, displayId: true } },
        },
        orderBy: { id: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.agencyAffiliation.count({
        where: status ? { status: status as any } : {},
      }),
    ]);

    return {
      agencies: agencyUsers.map((u) => userForApi(u)),
      affiliations: affiliations.map((a) => ({
        id: Number(a.id),
        agency_user_id: Number(a.agencyUserId),
        room_owner_id: Number(a.roomOwnerId),
        room_id: a.roomId,
        status: a.status,
        joined_at: a.joinedAt?.toISOString() ?? null,
        left_at: a.leftAt?.toISOString() ?? null,
        cooldown_until: a.cooldownUntil?.toISOString() ?? null,
        agency: {
          id: Number(a.agency.id),
          name: a.agency.displayName ?? a.agency.name,
          country: a.agency.country,
        },
        room_owner: {
          id: Number(a.roomOwner.id),
          name: a.roomOwner.displayName ?? a.roomOwner.name,
          country: a.roomOwner.country,
        },
        room: a.room ? { id: a.room.id, title: a.room.title, display_id: a.room.displayId } : null,
      })),
      meta: {
        page,
        limit,
        total: totalAffiliations,
        pages: Math.ceil(totalAffiliations / limit),
      },
    };
  }

  async clearAgencyCooldown(id: bigint) {
    const updated = await this.prisma.agencyAffiliation.update({
      where: { id },
      data: { cooldownUntil: null },
    });
    return { id: Number(updated.id), cooldown_until: null, message: 'Cooldown cleared' };
  }

  // ──────────────────────────────────────────────
  // Star Accounts
  // ──────────────────────────────────────────────

  async starAccounts() {
    const rows = await this.prisma.user.findMany({
      where: { isStarAccount: true, deletedAt: null },
      orderBy: [{ starRank: 'asc' }, { id: 'asc' }],
    });
    return {
      stars: rows.map((u) => ({
        id: Number(u.id),
        name: u.displayName ?? u.name,
        email: u.email,
        phone: u.phone,
        avatar_url: u.avatarUrl,
        star_rank: u.starRank,
        star_bio_tag: u.starBioTag,
        country: u.country,
        audio_call_rate: u.audioCallRate,
        video_call_rate: u.videoCallRate,
      })),
    };
  }

  async updateStarAccount(userId: bigint, body: { star_rank: number; star_bio_tag?: string }) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        isStarAccount: true,
        starRank: Number(body.star_rank),
        starBioTag: body.star_bio_tag ?? null,
      },
    });
    return userForApi(updated);
  }

  async removeStarAccount(userId: bigint) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        isStarAccount: false,
        starRank: null,
        starBioTag: null,
      },
    });
    return userForApi(updated);
  }

  async reorderStarAccounts(ranks: Array<{ user_id: number | string; star_rank: number }>) {
    await this.prisma.$transaction(
      ranks.map((r) =>
        this.prisma.user.update({
          where: { id: BigInt(r.user_id) },
          data: { starRank: Number(r.star_rank) },
        }),
      ),
    );
    return this.starAccounts();
  }

  // ──────────────────────────────────────────────
  // Party Room Analytics
  // ──────────────────────────────────────────────

  async partyRoomAnalytics() {
    const today = this.startOfDay();
    const [liveRooms, activeSessions, totalRoomsCreated, topPresences] = await Promise.all([
      this.prisma.room.count({ where: { isLive: true } }),
      this.prisma.userRoomPresenceSession.count({ where: { isActive: true } }),
      this.prisma.room.count(),
      this.prisma.userRoomPresenceSession.findMany({
        take: 50,
        orderBy: { accumulatedSeconds: 'desc' },
        include: {
          user: { select: { id: true, name: true, displayName: true, avatarUrl: true, country: true } },
          room: { select: { id: true, title: true, displayId: true } },
        },
      }),
    ]);

    // Daily Trend
    const dailyTrend: Array<{ date: string; sessions: number }> = [];
    for (let i = 0; i < 7; i++) {
      const dStart = new Date();
      dStart.setDate(dStart.getDate() - i);
      dStart.setHours(0, 0, 0, 0);
      const dEnd = new Date(dStart);
      dEnd.setDate(dEnd.getDate() + 1);

      const count = await this.prisma.userRoomPresenceSession.count({
        where: { createdAt: { gte: dStart, lt: dEnd } },
      });
      dailyTrend.push({ date: dStart.toISOString().split('T')[0], sessions: count });
    }

    return {
      kpis: {
        live_rooms: liveRooms,
        active_sessions: activeSessions,
        total_rooms: totalRoomsCreated,
      },
      daily_trend: dailyTrend,
      leaderboard: topPresences.map((p) => ({
        id: Number(p.id),
        user_id: Number(p.userId),
        user_name: p.user.displayName ?? p.user.name,
        avatar_url: p.user.avatarUrl,
        country: p.user.country,
        room_id: p.roomId,
        room_title: p.room.title,
        room_display_id: p.room.displayId,
        accumulated_seconds: p.accumulatedSeconds,
        is_active: p.isActive,
        joined_at: p.joinedAt.toISOString(),
      })),
    };
  }

  async userPartyRoomSessions(userId: bigint) {
    const rows = await this.prisma.userRoomPresenceSession.findMany({
      where: { userId },
      include: { room: { select: { id: true, title: true, displayId: true } } },
      orderBy: { id: 'desc' },
      take: 50,
    });
    return {
      sessions: rows.map((s) => ({
        id: Number(s.id),
        room_id: s.roomId,
        room_title: s.room.title,
        room_display_id: s.room.displayId,
        joined_at: s.joinedAt.toISOString(),
        closed_at: s.closedAt?.toISOString() ?? null,
        duration_seconds: s.finalSeconds || s.accumulatedSeconds,
        is_active: s.isActive,
        close_reason: s.closeReason,
      })),
    };
  }

  async suspendPartyRoomSession(sessionId: bigint) {
    const updated = await this.prisma.userRoomPresenceSession.update({
      where: { id: sessionId },
      data: {
        isActive: false,
        closedAt: new Date(),
        closeReason: 'admin_suspended',
      },
    });
    return { id: Number(updated.id), status: 'suspended' };
  }

  async closeStalePartyRoomSessions() {
    const threshold = new Date(Date.now() - 5 * 60 * 1000);
    const updated = await this.prisma.userRoomPresenceSession.updateMany({
      where: {
        isActive: true,
        lastHeartbeatAt: { lt: threshold },
      },
      data: {
        isActive: false,
        closedAt: new Date(),
        closeReason: 'stale_heartbeat_timeout',
      },
    });
    return { closed_count: updated.count };
  }

  // ──────────────────────────────────────────────
  // User Location Compliance
  // ──────────────────────────────────────────────

  async userLocationCompliance(q = '', country = '', page = 1, limit = 25) {
    const skip = (page - 1) * limit;
    const whereClause: any = { deletedAt: null };
    if (country) {
      whereClause.OR = [
        { country: country.toUpperCase() },
        { lastClientCountry: country.toUpperCase() },
      ];
    }
    if (q) {
      whereClause.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { displayName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
      ];
    }

    const [rows, total, totalActive, countryAgg] = await Promise.all([
      this.prisma.user.findMany({
        where: whereClause,
        orderBy: { id: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where: whereClause }),
      this.prisma.user.count({ where: { accountStatus: 'active' } }),
      this.prisma.user.groupBy({
        by: ['country'],
        _count: { id: true },
      }),
    ]);

    return {
      kpis: {
        total_tracked_users: totalActive,
        countries_detected: countryAgg.length,
      },
      users: rows.map((u) => ({
        id: Number(u.id),
        name: u.displayName ?? u.name,
        email: u.email,
        phone: u.phone,
        profile_country: u.country,
        client_country: u.lastClientCountry ?? u.country,
        effective_country: u.lastClientCountry ?? u.country ?? 'Unknown',
        coin_balance: Number(u.coinBalance),
        wallet_balance: Number(u.walletBalance),
        account_status: u.accountStatus,
        registered_at: u.createdAt.toISOString(),
      })),
      meta: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async exportLocationComplianceCsv() {
    const rows = await this.prisma.user.findMany({
      where: { deletedAt: null },
      take: 2000,
      orderBy: { id: 'desc' },
    });
    const header = 'ID,Name,Email,Phone,Profile Country,Last Client Country,Coins,Status,Registered At\n';
    const lines = rows.map((u) =>
      `"${Number(u.id)}","${u.displayName ?? u.name ?? ''}","${u.email ?? ''}","${u.phone ?? ''}","${u.country ?? ''}","${u.lastClientCountry ?? ''}","${Number(u.coinBalance)}","${u.accountStatus}","${u.createdAt.toISOString()}"`,
    );
    return header + lines.join('\n');
  }

  // ──────────────────────────────────────────────
  // User Reports / Moderation
  // ──────────────────────────────────────────────

  async moderationReports(status = 'all', q = '', page = 1, limit = 25) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status !== 'all') {
      where.status = status;
    }
    if (q) {
      where.OR = [
        { reportedUser: { name: { contains: q, mode: 'insensitive' } } },
        { reportedUser: { displayName: { contains: q, mode: 'insensitive' } } },
        { reporter: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [rows, total, pendingCount] = await Promise.all([
      this.prisma.userReport.findMany({
        where,
        include: {
          reporter: { select: { id: true, name: true, displayName: true, email: true } },
          reported: { select: { id: true, name: true, displayName: true, email: true, accountStatus: true } },
        },
        orderBy: { id: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.userReport.count({ where }),
      this.prisma.userReport.count({ where: { status: 'pending' } }),
    ]);

    return {
      pending_count: pendingCount,
      reports: rows.map((r) => ({
        id: Number(r.id),
        category: r.reason,
        reason: r.reason,
        description: r.description,
        status: r.status,
        notes: r.notes,
        created_at: r.createdAt.toISOString(),
        reporter: {
          id: Number(r.reporter.id),
          name: r.reporter.displayName ?? r.reporter.name,
          email: r.reporter.email,
        },
        reported_user: {
          id: Number(r.reported.id),
          name: r.reported.displayName ?? r.reported.name,
          email: r.reported.email,
          status: r.reported.accountStatus,
        },
      })),
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async moderationReportDetail(id: bigint) {
    const r = await this.prisma.userReport.findUnique({
      where: { id },
      include: {
        reporter: { select: { id: true, name: true, displayName: true, email: true, avatarUrl: true } },
        reported: { select: { id: true, name: true, displayName: true, email: true, avatarUrl: true, accountStatus: true } },
      },
    });
    if (!r) throw new NotFoundException('Report not found');
    return {
      report: {
        id: Number(r.id),
        category: r.reason,
        reason: r.reason,
        description: r.description,
        status: r.status,
        notes: r.notes,
        created_at: r.createdAt.toISOString(),
        reporter: r.reporter ? { ...r.reporter, id: Number(r.reporter.id) } : null,
        reported_user: r.reported ? { ...r.reported, id: Number(r.reported.id) } : null,
      },
    };
  }

  async resolveModerationReport(id: bigint, notes?: string) {
    const updated = await this.prisma.userReport.update({
      where: { id },
      data: { status: 'resolved', ...(notes ? { notes } : {}) },
    });
    return { id: Number(updated.id), status: 'resolved' };
  }

  async dismissModerationReport(id: bigint) {
    const updated = await this.prisma.userReport.update({
      where: { id },
      data: { status: 'dismissed' },
    });
    return { id: Number(updated.id), status: 'dismissed' };
  }

  async reopenModerationReport(id: bigint) {
    const updated = await this.prisma.userReport.update({
      where: { id },
      data: { status: 'pending' },
    });
    return { id: Number(updated.id), status: 'pending' };
  }

  async clearUserReview(userId: bigint) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { accountStatus: 'active' },
    });
    return userForApi(updated);
  }

  // ──────────────────────────────────────────────
  // Media Moderation (Posts & Reels)
  // ──────────────────────────────────────────────

  async adminPosts(page = 1, limit = 20, q = '') {
    const skip = (page - 1) * limit;
    const where: any = { kind: 'post', isDeleted: false };
    if (q) {
      where.OR = [
        { caption: { contains: q, mode: 'insensitive' } },
        { user: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.mediaItem.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, displayName: true, avatarUrl: true } },
          _count: { select: { likes: true, comments: true } },
        },
        orderBy: { id: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.mediaItem.count({ where }),
    ]);

    return {
      posts: rows.map((p) => ({
        id: Number(p.id),
        caption: p.caption,
        media_url: p.fileUrl,
        thumbnail_url: p.thumbnailUrl ?? p.fileUrl,
        likes_count: p._count.likes,
        comments_count: p._count.comments,
        is_deleted: p.isDeleted,
        created_at: p.createdAt.toISOString(),
        user: {
          id: Number(p.user.id),
          name: p.user.displayName ?? p.user.name,
          avatar_url: p.user.avatarUrl,
        },
      })),
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async deleteMediaPost(id: bigint) {
    await this.prisma.mediaItem.update({
      where: { id },
      data: { isDeleted: true },
    });
    return { message: 'Post deactivated' };
  }

  async createAdminMediaPost(
    kind: 'post' | 'reel',
    body: {
      user_id?: number | string;
      username?: string;
      email?: string;
      file_url: string;
      caption?: string;
      thumbnail_url?: string;
    },
  ) {
    let targetUser = null;
    if (body.user_id) {
      targetUser = await this.prisma.user.findUnique({
        where: { id: BigInt(body.user_id) },
      });
    } else if (body.email) {
      targetUser = await this.prisma.user.findUnique({
        where: { email: body.email.trim().toLowerCase() },
      });
    } else if (body.username) {
      targetUser = await this.prisma.user.findFirst({
        where: {
          OR: [
            { name: { equals: body.username.trim(), mode: 'insensitive' } },
            { displayName: { equals: body.username.trim(), mode: 'insensitive' } },
          ],
        },
      });
    }
    if (!targetUser) {
      throw new NotFoundException({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'Target user not found' },
      });
    }

    const row = await this.prisma.mediaItem.create({
      data: {
        userId: targetUser.id,
        kind,
        mediaType: kind === 'reel' ? 'video' : 'image',
        fileUrl: body.file_url,
        thumbnailUrl: body.thumbnail_url ?? null,
        caption: body.caption ?? null,
        isDeleted: false,
      },
      include: {
        user: { select: { id: true, name: true, displayName: true, avatarUrl: true } },
      },
    });

    return {
      id: Number(row.id),
      kind: row.kind,
      file_url: row.fileUrl,
      caption: row.caption,
      user: {
        id: Number(row.user.id),
        name: row.user.displayName ?? row.user.name,
        avatar_url: row.user.avatarUrl,
      },
    };
  }

  async adminReels(page = 1, limit = 20, q = '') {
    const skip = (page - 1) * limit;
    const where: any = { kind: 'reel', isDeleted: false };
    if (q) {
      where.OR = [
        { caption: { contains: q, mode: 'insensitive' } },
        { user: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.mediaItem.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, displayName: true, avatarUrl: true } },
          _count: { select: { likes: true, comments: true } },
        },
        orderBy: { id: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.mediaItem.count({ where }),
    ]);

    return {
      reels: rows.map((r) => ({
        id: Number(r.id),
        caption: r.caption,
        media_url: r.fileUrl,
        thumbnail_url: r.thumbnailUrl ?? r.fileUrl,
        likes_count: r._count.likes,
        comments_count: r._count.comments,
        views_count: r.viewsCount,
        created_at: r.createdAt.toISOString(),
        user: {
          id: Number(r.user.id),
          name: r.user.displayName ?? r.user.name,
          avatar_url: r.user.avatarUrl,
        },
      })),
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async deleteMediaReel(id: bigint) {
    await this.prisma.mediaItem.delete({ where: { id } });
    return { message: 'Reel deleted' };
  }

  // ──────────────────────────────────────────────
  // Transactions
  // ──────────────────────────────────────────────

  async adminTransactions(source = '', status = '', q = '', page = 1, limit = 25) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (source) where.type = source.toUpperCase();
    if (q) {
      where.user = {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      };
    }

    const [rows, total, agg] = await Promise.all([
      this.prisma.coinTransaction.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, displayName: true } },
        },
        orderBy: { id: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.coinTransaction.count({ where }),
      this.prisma.coinTransaction.aggregate({
        _sum: { coinAmount: true, commissionAmount: true, netAmount: true },
      }),
    ]);

    return {
      analytics: {
        total_coins: Number(agg._sum.coinAmount ?? 0n),
        total_commission: Number(agg._sum.commissionAmount ?? 0n),
        total_net: Number(agg._sum.netAmount ?? 0n),
      },
      transactions: rows.map((t) => ({
        id: Number(t.id),
        user_id: Number(t.userId),
        user_name: t.user.displayName ?? t.user.name,
        type: t.type,
        amount: Number(t.coinAmount),
        net_amount: Number(t.netAmount),
        commission_amount: Number(t.commissionAmount),
        status: 'SUCCESS',
        created_at: t.createdAt.toISOString(),
      })),
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async userAnalytics(userId: bigint) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const bands = await ensureLaravelLevelBands(this.prisma);
    const [ledger, claims, sessions, referralCount, milestone] = await Promise.all([
      this.prisma.coinTransaction.findMany({
        where: { userId },
        orderBy: { id: 'desc' },
        take: 50,
      }),
      this.prisma.bonusClaim.findMany({
        where: { userId },
        orderBy: { id: 'desc' },
        take: 50,
      }),
      this.prisma.userRoomPresenceSession.findMany({
        where: { userId },
        orderBy: { id: 'desc' },
        take: 20,
      }),
      this.prisma.user.count({ where: { invitedBy: userId } }),
      this.prisma.bonusClaim.findFirst({
        where: { userId, referenceKey: 'referral_milestone' },
      }),
    ]);
    const xp = Number(user.xp);
    const band = bandForXp(xp, bands);
    return {
      user_id: Number(user.id),
      level: band.level,
      level_label: band.label,
      level_min_xp: band.minXp,
      level_max_xp: band.maxXp,
      xp_progress_pct: band.xpProgressPct,
      xp,
      wallet_balance: Number(user.walletBalance),
      gems: Number(user.gems),
      referral_count: referralCount,
      referral_milestone_claimed: !!milestone,
      level_bands: bands.map((b) => ({
        level: b.level,
        min_xp: Number(b.minXp),
        max_xp: Number(b.maxXp),
        label: b.label,
      })),
      ledger: ledger.map((t) => ({
        id: Number(t.id),
        type: t.type,
        coin_amount: Number(t.coinAmount),
        balance_after: t.balanceAfter !== null ? Number(t.balanceAfter) : null,
        reference_id: t.referenceId,
        status: t.status,
        meta: t.meta,
        created_at: t.createdAt.toISOString(),
      })),
      bonus_claims: claims.map((c) => ({
        id: Number(c.id),
        kind: c.kind,
        coins: c.coins,
        reference_key: c.referenceKey,
        meta: c.meta,
        created_at: c.createdAt.toISOString(),
      })),
      presence_sessions: sessions.map((s) => ({
        id: Number(s.id),
        room_id: s.roomId,
        accumulated_seconds: s.accumulatedSeconds,
        final_seconds: s.finalSeconds,
        is_active: s.isActive,
        close_reason: s.closeReason,
        joined_at: s.joinedAt.toISOString(),
        closed_at: s.closedAt?.toISOString() ?? null,
      })),
    };
  }

  async exportTransactionsCsv() {
    const rows = await this.prisma.coinTransaction.findMany({
      take: 2000,
      include: { user: { select: { name: true, displayName: true } } },
      orderBy: { id: 'desc' },
    });
    const header = 'ID,User ID,User Name,Type,Amount,Net Amount,Commission,Created At\n';
    const lines = rows.map((t) =>
      `"${Number(t.id)}","${Number(t.userId)}","${t.user.displayName ?? t.user.name}","${t.type}","${Number(t.coinAmount)}","${Number(t.netAmount)}","${Number(t.commissionAmount)}","${t.createdAt.toISOString()}"`,
    );
    return header + lines.join('\n');
  }

  private startOfDay() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private startOfWeek() {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    d.setHours(0, 0, 0, 0);
    return d;
  }
}

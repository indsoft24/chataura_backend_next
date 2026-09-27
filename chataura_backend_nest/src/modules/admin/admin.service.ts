import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { bandForXp, ensureLaravelLevelBands } from '../gamification/level-bands';
import { LedgerService } from '../wallet/ledger.service';
import { userForApi } from '../user/user.serializer';

const PLATFORM_WALLET_EMAIL =
  process.env.PLATFORM_WALLET_EMAIL?.trim().toLowerCase() ||
  'platform@chataura.local';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

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
        where: { type: { in: ['GAME_LUCKY77_WIN', 'GAME_GREEDY_WIN', 'SPIN_WIN', 'LUCKY_GIFT_REBATE'] }, createdAt: { gte: from, lte: to } },
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
        select: { id: true, name: true, displayName: true, email: true, walletBalance: true },
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
            coin_balance: Number(systemUser.walletBalance),
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

  async users(
    q?: string,
    page = 1,
    limit = 20,
    filters: {
      status?: string;
      role?: string;
      star?: string;
      online?: string;
      sort?: string;
      order?: string;
    } = {},
  ) {
    const take = Math.min(Math.max(Number.isFinite(limit) ? limit : 20, 1), 100);
    page = Math.max(Number.isFinite(page) ? Math.floor(page) : 1, 1);
    const skip = (page - 1) * take;

    const base: Prisma.UserWhereInput[] = [];
    const term = q?.trim().replace(/^#/, '');
    if (term) {
      base.push({
        OR: [
          { email: { contains: term, mode: 'insensitive' } },
          { displayName: { contains: term, mode: 'insensitive' } },
          { name: { contains: term, mode: 'insensitive' } },
          { phone: { contains: term } },
          ...(/^\d{1,18}$/.test(term) ? [{ id: BigInt(term) }] : []),
        ],
      });
    }
    if (filters.role && (Object.values(UserRole) as string[]).includes(filters.role)) {
      base.push({ role: filters.role as UserRole });
    }
    if (filters.star === 'yes' || filters.star === 'no') {
      base.push({ isStarAccount: filters.star === 'yes' });
    }
    if (filters.online === 'yes' || filters.online === 'no') {
      base.push({ isOnline: filters.online === 'yes' });
    }

    const statusWhere: Record<'active' | 'suspended' | 'deactivated', Prisma.UserWhereInput> = {
      active: {
        deletedAt: null,
        accountStatus: 'active',
        isSuspended: false,
      },
      suspended: {
        deletedAt: null,
        accountStatus: { not: 'deleted' },
        OR: [{ isSuspended: true }, { accountStatus: 'suspended' }],
      },
      deactivated: {
        OR: [{ accountStatus: 'deleted' }, { deletedAt: { not: null } }],
      },
    };
    const statusKey = filters.status as keyof typeof statusWhere | undefined;
    const where: Prisma.UserWhereInput = {
      AND: [...base, ...(statusKey && statusWhere[statusKey] ? [statusWhere[statusKey]] : [])],
    };

    const dir: Prisma.SortOrder = filters.order === 'asc' ? 'asc' : 'desc';
    const sortMap: Record<string, Prisma.UserOrderByWithRelationInput[]> = {
      id: [{ id: dir }],
      created_at: [{ createdAt: dir }, { id: dir }],
      name: [{ displayName: { sort: dir, nulls: 'last' } }, { id: dir }],
      coins: [{ walletBalance: dir }, { id: dir }],
      gems: [{ gems: dir }, { id: dir }],
      level: [{ level: dir }, { xp: dir }, { id: dir }],
      last_seen: [{ lastSeenAt: { sort: dir, nulls: 'last' } }, { id: dir }],
    };
    const orderBy = sortMap[filters.sort ?? ''] ?? sortMap.id;

    const countFor = (extra?: Prisma.UserWhereInput) =>
      this.prisma.user.count({ where: { AND: [...base, ...(extra ? [extra] : [])] } });

    const [total, rows, all, active, suspended, deactivated] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({ where, skip, take, orderBy }),
      countFor(),
      countFor(statusWhere.active),
      countFor(statusWhere.suspended),
      countFor(statusWhere.deactivated),
    ]);
    const totalPages = Math.max(1, Math.ceil(total / take));
    return {
      users: rows.map((user) => ({
        ...userForApi(user),
        status: this.adminUserStatus(user),
        is_suspended: user.isSuspended,
        suspended_reason: user.suspendedReason,
      })),
      total,
      page,
      limit: take,
      total_pages: totalPages,
      counts: { all, active, suspended, deactivated },
      meta: {
        total,
        page,
        last_page: totalPages,
        limit: take,
      },
    };
  }

  private adminUserStatus(user: {
    deletedAt: Date | null;
    accountStatus: string;
    isSuspended: boolean;
  }): 'active' | 'suspended' | 'deactivated' {
    if (user.deletedAt || user.accountStatus === 'deleted') return 'deactivated';
    if (user.isSuspended || user.accountStatus === 'suspended') return 'suspended';
    return 'active';
  }

  async restoreUser(id: bigint) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }
    if (user.email?.endsWith('@deleted.local')) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'SELF_DELETED',
          message: 'This account was deleted by the user and cannot be restored',
        },
      });
    }
    const u = await this.prisma.user.update({
      where: { id },
      data: {
        accountStatus: 'active',
        isSuspended: false,
        suspendedReason: null,
        deletedAt: null,
      },
    });
    return userForApi(u);
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
      data: {
        isSuspended: true,
        suspendedReason: reason ?? 'admin_suspend',
        ...(user.accountStatus === 'deleted' ? {} : { accountStatus: 'suspended' as const }),
      },
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
      data: {
        isSuspended: false,
        suspendedReason: null,
        ...(user.accountStatus === 'suspended' ? { accountStatus: 'active' as const } : {}),
      },
    });
    return userForApi(u);
  }

  /**
   * Manual admin credit/debit for coins or gems.
   * Debit requires a note. Coins go through the ledger; gems update users.gems
   * and leave an audit row on coin_transactions (amount 0, meta.gems_delta).
   */
  async adjustBalance(
    targetId: bigint,
    body: {
      asset: 'coins' | 'gems';
      action: 'add' | 'deduct' | 'credit' | 'debit';
      amount: number;
      note?: string;
    },
    adminId?: bigint,
  ) {
    const asset = body.asset;
    const action =
      body.action === 'credit' || body.action === 'add' ? 'add' : 'deduct';
    const amount = Math.floor(Number(body.amount));
    const note = String(body.note ?? '').trim();

    if (!Number.isFinite(amount) || amount < 1) {
      throw new BadRequestException({
        success: false,
        error: { code: 'INVALID_AMOUNT', message: 'Amount must be a positive integer' },
      });
    }
    if (action === 'deduct' && !note) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'NOTE_REQUIRED',
          message: 'A note is required when deducting coins or gems',
        },
      });
    }

    const user = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!user || user.deletedAt) {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }
    if ((user.email ?? '').trim().toLowerCase() === PLATFORM_WALLET_EMAIL) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Cannot adjust the platform wallet account',
        },
      });
    }

    const ref = `admin_adjust_${asset}_${action}_${targetId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const titleBase =
      action === 'add'
        ? `Admin credit ${amount} ${asset}`
        : `Admin debit ${amount} ${asset}`;
    const title = note ? `${titleBase}: ${note.slice(0, 180)}` : titleBase;
    const meta = {
      source: 'admin_adjust',
      asset,
      action,
      amount,
      note: note || null,
      admin_id: adminId != null ? Number(adminId) : null,
    };

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        if (asset === 'coins') {
          if (action === 'add') {
            const after = await this.ledger.creditCoins(
              tx,
              targetId,
              amount,
              'ADMIN_CREDIT',
              title,
              ref,
              null,
              meta,
            );
            return {
              coin_balance: Number(after),
              wallet_balance: Number(after),
              gems: Number(user.gems),
            };
          }
          const { after } = await this.ledger.debitCoins(
            tx,
            targetId,
            amount,
            'ADMIN_DEBIT',
            title,
            ref,
            null,
            meta,
          );
          return {
            coin_balance: Number(after),
            wallet_balance: Number(after),
            gems: Number(user.gems),
          };
        }

        // gems
        const locked = await this.ledger.lockUser(tx, targetId);
        if (!locked) throw new Error('USER_NOT_FOUND');
        const gemsBefore = BigInt(locked.gems);
        if (action === 'deduct' && gemsBefore < BigInt(amount)) {
          throw Object.assign(new Error('INSUFFICIENT_GEMS'), {
            code: 'INSUFFICIENT_GEMS',
            available: Number(gemsBefore),
          });
        }
        const gemsAfter =
          action === 'add'
            ? gemsBefore + BigInt(amount)
            : gemsBefore - BigInt(amount);
        await tx.user.update({
          where: { id: targetId },
          data: {
            gems:
              action === 'add'
                ? { increment: BigInt(amount) }
                : { decrement: BigInt(amount) },
          },
        });
        await this.ledger.writeLedger(tx, {
          userId: targetId,
          type: action === 'add' ? 'ADMIN_GEM_CREDIT' : 'ADMIN_GEM_DEBIT',
          title,
          coinAmount: 0,
          balanceAfter: BigInt(locked.wallet_balance),
          referenceId: ref,
          meta: { ...meta, gems_before: Number(gemsBefore), gems_after: Number(gemsAfter) },
        });
        return {
          coin_balance: Number(locked.wallet_balance),
          wallet_balance: Number(locked.wallet_balance),
          gems: Number(gemsAfter),
        };
      });

      return {
        message:
          action === 'add'
            ? `Added ${amount} ${asset} to user #${Number(targetId)}`
            : `Deducted ${amount} ${asset} from user #${Number(targetId)}`,
        user_id: Number(targetId),
        asset,
        action,
        amount,
        note: note || null,
        balances: result,
      };
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string; available?: number };
      if (err.code === 'INSUFFICIENT_BALANCE') {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'INSUFFICIENT_BALANCE',
            message: 'User does not have enough coins',
          },
        });
      }
      if (err.code === 'INSUFFICIENT_GEMS') {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'INSUFFICIENT_GEMS',
            message: `User only has ${err.available ?? 0} gems available`,
          },
        });
      }
      throw e;
    }
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
          staffBadgeType: null,
          selectedRoleFrameId: null,
        },
      });
    });
    return { message: 'User deactivated', user_id: Number(id) };
  }

  async linkExistingUser(
    userId: bigint,
    body: {
      role?: 'agency' | 'user' | 'seller' | 'admin';
      email?: string;
      staff_badge_type?: string;
      badge_type?: string;
    },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }
    const nextRole = body.role ?? 'admin';
    const staffBadge =
      body.staff_badge_type ?? body.badge_type ?? undefined;
    const demoting = nextRole === 'user';
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        role: nextRole,
        ...(body.email ? { email: body.email } : {}),
        ...(demoting
          ? { staffBadgeType: null, selectedRoleFrameId: null }
          : staffBadge !== undefined
            ? { staffBadgeType: staffBadge || null }
            : {}),
        accountStatus: 'active',
        isSuspended: false,
        deletedAt: null,
      },
    });
    return userForApi(updated);
  }

  async staff() {
    const rows = await this.prisma.user.findMany({
      where: { role: { in: ['admin', 'seller', 'agency'] }, deletedAt: null },
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

  private presenceStatusWhere(threshold: Date): Record<'active' | 'stale' | 'ended', Prisma.UserRoomPresenceSessionWhereInput> {
    return {
      active: {
        isActive: true,
        OR: [
          { lastHeartbeatAt: { gte: threshold } },
          { lastHeartbeatAt: null, joinedAt: { gte: threshold } },
        ],
      },
      stale: {
        isActive: true,
        OR: [
          { lastHeartbeatAt: { lt: threshold } },
          { lastHeartbeatAt: null, joinedAt: { lt: threshold } },
        ],
      },
      ended: { isActive: false },
    };
  }

  async partyRoomAnalytics(query: Record<string, string | undefined> = {}) {
    const limitRaw = Number(query.limit ?? 25);
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 25, 1), 100);
    const pageRaw = Number(query.page ?? 1);
    const page = Math.max(Number.isFinite(pageRaw) ? Math.floor(pageRaw) : 1, 1);
    const threshold = new Date(Date.now() - 5 * 60 * 1000);
    const statusWhere = this.presenceStatusWhere(threshold);

    const base: Prisma.UserRoomPresenceSessionWhereInput[] = [];
    const q = query.q?.trim().replace(/^#/, '');
    if (q) {
      const or: Prisma.UserRoomPresenceSessionWhereInput[] = [
        {
          user: {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { displayName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          },
        },
        { room: { title: { contains: q, mode: 'insensitive' } } },
        { room: { displayId: { contains: q } } },
      ];
      if (/^\d{1,18}$/.test(q)) or.push({ userId: BigInt(q) }, { id: BigInt(q) });
      base.push({ OR: or });
    }
    if (query.user_id && /^\d{1,18}$/.test(query.user_id)) base.push({ userId: BigInt(query.user_id) });
    if (query.room_id && /^[0-9a-f-]{36}$/i.test(query.room_id)) base.push({ roomId: query.room_id });
    if (query.close_reason) base.push({ closeReason: query.close_reason });
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;
    if (from && !Number.isNaN(from.getTime())) base.push({ joinedAt: { gte: from } });
    if (to && !Number.isNaN(to.getTime())) base.push({ joinedAt: { lte: to } });
    const minMinutes = Number(query.min_minutes);
    if (Number.isFinite(minMinutes) && minMinutes > 0) {
      base.push({ accumulatedSeconds: { gte: Math.floor(minMinutes * 60) } });
    }

    const statusKey = query.status as keyof typeof statusWhere | undefined;
    const where: Prisma.UserRoomPresenceSessionWhereInput = {
      AND: [...base, ...(statusKey && statusWhere[statusKey] ? [statusWhere[statusKey]] : [])],
    };

    const dir: Prisma.SortOrder = query.order === 'asc' ? 'asc' : 'desc';
    const orderBy: Prisma.UserRoomPresenceSessionOrderByWithRelationInput[] =
      query.sort === 'joined_at'
        ? [{ joinedAt: dir }, { id: dir }]
        : query.sort === 'duration'
          ? [{ accumulatedSeconds: dir }, { id: dir }]
          : query.sort === 'last_heartbeat'
            ? [{ lastHeartbeatAt: { sort: dir, nulls: 'last' } }, { id: dir }]
            : [{ id: dir }];

    const countFor = (extra?: Prisma.UserRoomPresenceSessionWhereInput) =>
      this.prisma.userRoomPresenceSession.count({ where: { AND: [...base, ...(extra ? [extra] : [])] } });

    const today = this.startOfDay();
    const [
      liveRooms,
      totalRoomsCreated,
      sessionsToday,
      rows,
      total,
      agg,
      uniqueUsers,
      all,
      active,
      stale,
      ended,
      reasons,
    ] = await Promise.all([
      this.prisma.room.count({ where: { isLive: true } }),
      this.prisma.room.count(),
      this.prisma.userRoomPresenceSession.count({ where: { joinedAt: { gte: today } } }),
      this.prisma.userRoomPresenceSession.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, name: true, displayName: true, avatarUrl: true, country: true, email: true } },
          room: { select: { id: true, title: true, displayId: true, isLive: true } },
        },
      }),
      this.prisma.userRoomPresenceSession.count({ where }),
      this.prisma.userRoomPresenceSession.aggregate({ where, _sum: { accumulatedSeconds: true }, _avg: { accumulatedSeconds: true } }),
      this.prisma.userRoomPresenceSession.groupBy({ by: ['userId'], where }),
      countFor(),
      countFor(statusWhere.active),
      countFor(statusWhere.stale),
      countFor(statusWhere.ended),
      this.prisma.userRoomPresenceSession.groupBy({
        by: ['closeReason'],
        where: { closeReason: { not: null } },
        _count: { _all: true },
      }),
    ]);

    const pages = Math.max(1, Math.ceil(total / limit));
    return {
      kpis: {
        live_rooms: liveRooms,
        active_sessions: active,
        stale_sessions: stale,
        total_rooms: totalRoomsCreated,
        sessions_today: sessionsToday,
        total_seconds: agg._sum.accumulatedSeconds ?? 0,
        avg_seconds: Math.round(agg._avg.accumulatedSeconds ?? 0),
        unique_users: uniqueUsers.length,
      },
      counts: { all, active, stale, ended },
      close_reasons: reasons
        .map((r) => ({ reason: r.closeReason as string, count: r._count._all }))
        .sort((a, b) => b.count - a.count),
      sessions: rows.map((p) => {
        const status = !p.isActive
          ? 'ended'
          : (p.lastHeartbeatAt ?? p.joinedAt) < threshold
            ? 'stale'
            : 'active';
        return {
          id: Number(p.id),
          user_id: Number(p.userId),
          user_name: p.user.displayName ?? p.user.name,
          user_email: p.user.email,
          avatar_url: p.user.avatarUrl,
          country: p.user.country,
          room_id: p.roomId,
          room_title: p.room.title,
          room_display_id: p.room.displayId,
          room_is_live: p.room.isLive,
          accumulated_seconds: p.finalSeconds || p.accumulatedSeconds,
          status,
          is_active: p.isActive,
          joined_at: p.joinedAt.toISOString(),
          last_heartbeat_at: p.lastHeartbeatAt?.toISOString() ?? null,
          closed_at: p.closedAt?.toISOString() ?? null,
          close_reason: p.closeReason,
        };
      }),
      meta: { page, limit, total, pages },
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
      where: this.presenceStatusWhere(threshold).stale,
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

  // Legacy profile values that are country names rather than ISO codes.
  private static readonly COUNTRY_ALIASES: Record<string, string[]> = {
    IN: ['India'],
    PK: ['Pak', 'Pakistan'],
    BD: ['Bangladesh'],
    US: ['USA', 'United States'],
  };
  private static readonly NON_COUNTRY_VALUES = ['Global', 'Unknown', ''];

  private normalizeCountry(value: string | null | undefined): string | null {
    const v = value?.trim();
    if (!v) return null;
    if (AdminService.NON_COUNTRY_VALUES.some((n) => n.toLowerCase() === v.toLowerCase())) return null;
    for (const [code, names] of Object.entries(AdminService.COUNTRY_ALIASES)) {
      if (names.some((n) => n.toLowerCase() === v.toLowerCase())) return code;
    }
    return v.toUpperCase();
  }

  private isCountryMismatch(u: { country: string | null; lastClientCountry: string | null }) {
    const profile = this.normalizeCountry(u.country);
    const client = this.normalizeCountry(u.lastClientCountry);
    return !!profile && !!client && profile !== client;
  }

  private countryAliasPairs(): Prisma.UserWhereInput[] {
    return Object.entries(AdminService.COUNTRY_ALIASES).map(([code, names]) => ({
      lastClientCountry: { equals: code, mode: 'insensitive' as const },
      country: { in: names, mode: 'insensitive' as const },
    }));
  }

  private locationMismatchWhere(): Prisma.UserWhereInput {
    return {
      country: { not: null },
      lastClientCountry: { not: null },
      NOT: [
        { country: { equals: this.prisma.user.fields.lastClientCountry } },
        { country: { in: AdminService.NON_COUNTRY_VALUES, mode: 'insensitive' } },
        ...this.countryAliasPairs(),
      ],
    };
  }

  private locationWhere(query: Record<string, string | undefined>): Prisma.UserWhereInput {
    const and: Prisma.UserWhereInput[] = [];
    if (query.status === 'deactivated') {
      and.push({ OR: [{ accountStatus: 'deleted' }, { deletedAt: { not: null } }] });
    } else {
      and.push({ deletedAt: null, accountStatus: { not: 'deleted' } });
      if (query.status === 'active') and.push({ accountStatus: 'active', isSuspended: false });
      if (query.status === 'suspended') and.push({ OR: [{ isSuspended: true }, { accountStatus: 'suspended' }] });
    }

    const q = query.q?.trim().replace(/^#/, '');
    if (q) {
      and.push({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { displayName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q } },
          ...(/^\d{1,18}$/.test(q) ? [{ id: BigInt(q) }] : []),
        ],
      });
    }

    const country = query.country?.trim().toUpperCase();
    if (country === 'UNKNOWN') {
      and.push({
        lastClientCountry: null,
        OR: [{ country: null }, { country: { in: AdminService.NON_COUNTRY_VALUES, mode: 'insensitive' } }],
      });
    } else if (country) {
      const profileValues = [country, ...(AdminService.COUNTRY_ALIASES[country] ?? [])];
      and.push({
        OR: [
          { lastClientCountry: { equals: country, mode: 'insensitive' } },
          { lastClientCountry: null, country: { in: profileValues, mode: 'insensitive' } },
        ],
      });
    }

    if (query.match === 'mismatch') and.push(this.locationMismatchWhere());
    else if (query.match === 'match') {
      and.push({
        OR: [
          { country: { not: null, equals: this.prisma.user.fields.lastClientCountry } },
          ...this.countryAliasPairs(),
        ],
      });
    } else if (query.match === 'missing') {
      and.push({
        OR: [
          { country: null },
          { lastClientCountry: null },
          { country: { in: AdminService.NON_COUNTRY_VALUES, mode: 'insensitive' } },
        ],
      });
    }

    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;
    if (from && !Number.isNaN(from.getTime())) and.push({ createdAt: { gte: from } });
    if (to && !Number.isNaN(to.getTime())) and.push({ createdAt: { lte: to } });

    return { AND: and };
  }

  private locationOrder(query: Record<string, string | undefined>): Prisma.UserOrderByWithRelationInput[] {
    const dir: Prisma.SortOrder = query.order === 'asc' ? 'asc' : 'desc';
    switch (query.sort) {
      case 'created_at':
        return [{ createdAt: dir }, { id: dir }];
      case 'coins':
        return [{ walletBalance: dir }, { id: dir }];
      case 'name':
        return [{ displayName: { sort: dir, nulls: 'last' } }, { id: dir }];
      case 'country':
        return [
          { lastClientCountry: { sort: dir, nulls: 'last' } },
          { country: { sort: dir, nulls: 'last' } },
          { id: 'desc' },
        ];
      default:
        return [{ id: dir }];
    }
  }

  async userLocationCompliance(query: Record<string, string | undefined> = {}) {
    const limitRaw = Number(query.limit ?? 25);
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 25, 1), 100);
    const pageRaw = Number(query.page ?? 1);
    const page = Math.max(Number.isFinite(pageRaw) ? Math.floor(pageRaw) : 1, 1);
    const where = this.locationWhere(query);
    const tracked: Prisma.UserWhereInput = { deletedAt: null, accountStatus: { not: 'deleted' } };

    const [rows, total, totalTracked, mismatches, unknown, countryRows] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: this.locationOrder(query),
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
      this.prisma.user.count({ where: tracked }),
      this.prisma.user.count({ where: { AND: [tracked, this.locationMismatchWhere()] } }),
      this.prisma.user.count({ where: { AND: [tracked, this.locationWhere({ country: 'UNKNOWN' })] } }),
      this.prisma.$queryRaw<Array<{ code: string | null; count: bigint }>>`
        SELECT COALESCE(last_client_country, country) AS code, COUNT(*)::bigint AS count
        FROM users
        WHERE deleted_at IS NULL AND account_status <> 'deleted'
        GROUP BY 1`,
    ]);

    const countryMap = new Map<string, number>();
    for (const c of countryRows) {
      const code = this.normalizeCountry(c.code) ?? 'UNKNOWN';
      countryMap.set(code, (countryMap.get(code) ?? 0) + Number(c.count));
    }
    const countries = [...countryMap.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count);
    const pages = Math.max(1, Math.ceil(total / limit));
    return {
      kpis: {
        total_tracked_users: totalTracked,
        countries_detected: countries.filter((c) => c.code !== 'UNKNOWN').length,
        mismatches,
        unknown,
      },
      countries,
      users: rows.map((u) => ({
        id: Number(u.id),
        name: u.displayName ?? u.name,
        email: u.email,
        phone: u.phone,
        avatar_url: u.avatarUrl,
        profile_country: u.country,
        client_country: u.lastClientCountry,
        effective_country: this.normalizeCountry(u.lastClientCountry ?? u.country) ?? 'Unknown',
        country_mismatch: this.isCountryMismatch(u),
        coin_balance: Number(u.walletBalance),
        wallet_balance: Number(u.walletBalance),
        account_status: u.accountStatus,
        status: this.adminUserStatus(u),
        registered_at: u.createdAt.toISOString(),
      })),
      meta: { page, limit, total, pages },
    };
  }

  async exportLocationComplianceCsv(query: Record<string, string | undefined> = {}) {
    const rows = await this.prisma.user.findMany({
      where: this.locationWhere(query),
      take: 20000,
      orderBy: this.locationOrder(query),
    });
    const cell = (v: unknown) => `"${v === null || v === undefined ? '' : String(v).replace(/"/g, '""')}"`;
    const header =
      'ID,Name,Email,Phone,Profile Country,Last Client Country,Effective Country,Country Mismatch,Coins,Status,Registered At\n';
    const lines = rows.map((u) =>
      [
        Number(u.id),
        u.displayName ?? u.name,
        u.email,
        u.phone,
        u.country,
        u.lastClientCountry,
        this.normalizeCountry(u.lastClientCountry ?? u.country) ?? 'Unknown',
        this.isCountryMismatch(u) ? 'yes' : 'no',
        Number(u.walletBalance),
        this.adminUserStatus(u),
        u.createdAt.toISOString(),
      ]
        .map(cell)
        .join(','),
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

  async adminMedia(kind: 'post' | 'reel', query: Record<string, string | undefined> = {}) {
    const limitRaw = Number(query.limit ?? 20);
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 20, 1), 100);
    const pageRaw = Number(query.page ?? 1);
    const page = Math.max(Number.isFinite(pageRaw) ? Math.floor(pageRaw) : 1, 1);

    const base: Prisma.MediaItemWhereInput[] = [{ kind }];
    const q = query.q?.trim().replace(/^#/, '');
    if (q) {
      const or: Prisma.MediaItemWhereInput[] = [
        { caption: { contains: q, mode: 'insensitive' } },
        {
          user: {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { displayName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          },
        },
      ];
      if (/^\d{1,18}$/.test(q)) or.push({ id: BigInt(q) }, { userId: BigInt(q) });
      base.push({ OR: or });
    }
    if (query.user_id && /^\d{1,18}$/.test(query.user_id)) base.push({ userId: BigInt(query.user_id) });
    if (query.caption === 'yes') base.push({ caption: { not: null }, NOT: { caption: '' } });
    if (query.caption === 'no') base.push({ OR: [{ caption: null }, { caption: '' }] });
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;
    if (from && !Number.isNaN(from.getTime())) base.push({ createdAt: { gte: from } });
    if (to && !Number.isNaN(to.getTime())) base.push({ createdAt: { lte: to } });

    const statusWhere = { live: { isDeleted: false }, removed: { isDeleted: true } } as const;
    const statusKey = (query.status === 'removed' ? 'removed' : query.status === 'all' ? '' : 'live') as
      | keyof typeof statusWhere
      | '';
    const where: Prisma.MediaItemWhereInput = {
      AND: [...base, ...(statusKey ? [statusWhere[statusKey]] : [])],
    };

    const dir: Prisma.SortOrder = query.order === 'asc' ? 'asc' : 'desc';
    const orderBy: Prisma.MediaItemOrderByWithRelationInput[] =
      query.sort === 'likes'
        ? [{ likes: { _count: dir } }, { id: 'desc' }]
        : query.sort === 'comments'
          ? [{ comments: { _count: dir } }, { id: 'desc' }]
          : query.sort === 'views'
            ? [{ viewsCount: dir }, { id: 'desc' }]
            : [{ id: dir }];

    const countFor = (extra?: Prisma.MediaItemWhereInput) =>
      this.prisma.mediaItem.count({ where: { AND: [...base, ...(extra ? [extra] : [])] } });

    const [rows, total, live, removed] = await Promise.all([
      this.prisma.mediaItem.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, displayName: true, avatarUrl: true, email: true } },
          _count: { select: { likes: true, comments: true } },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.mediaItem.count({ where }),
      countFor(statusWhere.live),
      countFor(statusWhere.removed),
    ]);

    const items = rows.map((m) => ({
      id: Number(m.id),
      caption: m.caption,
      media_url: m.fileUrl,
      media_type: m.mediaType,
      thumbnail_url: m.thumbnailUrl ?? (kind === 'post' ? m.fileUrl : null),
      likes_count: m._count.likes,
      comments_count: m._count.comments,
      views_count: m.viewsCount,
      shares_count: m.sharesCount,
      duration: m.duration,
      is_deleted: m.isDeleted,
      created_at: m.createdAt.toISOString(),
      user: {
        id: Number(m.user.id),
        name: m.user.displayName ?? m.user.name,
        email: m.user.email,
        avatar_url: m.user.avatarUrl,
      },
    }));
    const pages = Math.max(1, Math.ceil(total / limit));
    return {
      [kind === 'post' ? 'posts' : 'reels']: items,
      items,
      counts: { live, removed, all: live + removed },
      meta: { page, limit, total, pages },
    };
  }

  async restoreMedia(id: bigint) {
    const row = await this.prisma.mediaItem.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Media not found' },
      });
    }
    await this.prisma.mediaItem.update({ where: { id }, data: { isDeleted: false } });
    return { message: 'Media restored', id: Number(id) };
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

  async deleteMediaReel(id: bigint) {
    await this.prisma.mediaItem.update({
      where: { id },
      data: { isDeleted: true },
    });
    return { message: 'Reel removed' };
  }

  // ──────────────────────────────────────────────
  // Transactions
  // ──────────────────────────────────────────────

  private transactionWhere(query: Record<string, string | undefined>): Prisma.CoinTransactionWhereInput {
    const and: Prisma.CoinTransactionWhereInput[] = [];
    const q = query.q?.trim().replace(/^#/, '');
    if (q) {
      const or: Prisma.CoinTransactionWhereInput[] = [
        { referenceId: { contains: q, mode: 'insensitive' } },
        { title: { contains: q, mode: 'insensitive' } },
        {
          user: {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { displayName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          },
        },
      ];
      if (/^\d{1,18}$/.test(q)) {
        or.push({ id: BigInt(q) }, { userId: BigInt(q) });
      }
      and.push({ OR: or });
    }
    const userId = query.user_id?.trim();
    if (userId && /^\d{1,18}$/.test(userId)) and.push({ userId: BigInt(userId) });

    const types = (query.type ?? query.source ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (types.length) and.push({ type: { in: types } });

    if (query.status?.trim()) and.push({ status: { equals: query.status.trim(), mode: 'insensitive' } });

    if (query.direction === 'credit') and.push({ coinAmount: { gt: 0 } });
    else if (query.direction === 'debit') and.push({ coinAmount: { lt: 0 } });
    else if (query.nonzero === '1' || query.nonzero === 'true') and.push({ coinAmount: { not: 0 } });

    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;
    if (from && !Number.isNaN(from.getTime())) and.push({ createdAt: { gte: from } });
    if (to && !Number.isNaN(to.getTime())) and.push({ createdAt: { lte: to } });

    const minAbs = Number(query.min_amount);
    const maxAbs = Number(query.max_amount);
    if (query.min_amount && Number.isFinite(minAbs) && minAbs > 0) {
      const v = BigInt(Math.floor(minAbs));
      and.push({ OR: [{ coinAmount: { gte: v } }, { coinAmount: { lte: -v } }] });
    }
    if (query.max_amount && Number.isFinite(maxAbs) && maxAbs >= 0) {
      const v = BigInt(Math.floor(maxAbs));
      and.push({ coinAmount: { gte: -v, lte: v } });
    }
    return and.length ? { AND: and } : {};
  }

  private transactionOrder(query: Record<string, string | undefined>): Prisma.CoinTransactionOrderByWithRelationInput[] {
    const dir: Prisma.SortOrder = query.order === 'asc' ? 'asc' : 'desc';
    switch (query.sort) {
      case 'created_at':
        return [{ createdAt: dir }, { id: dir }];
      case 'amount':
        return [{ coinAmount: dir }, { id: dir }];
      case 'commission':
        return [{ commissionAmount: { sort: dir, nulls: 'last' } }, { id: dir }];
      case 'net':
        return [{ netAmount: { sort: dir, nulls: 'last' } }, { id: dir }];
      case 'type':
        return [{ type: dir }, { id: 'desc' }];
      case 'user':
        return [{ userId: dir }, { id: 'desc' }];
      default:
        return [{ id: dir }];
    }
  }

  async adminTransactions(query: Record<string, string | undefined> = {}) {
    const limitRaw = Number(query.limit ?? 25);
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 25, 1), 200);
    const pageRaw = Number(query.page ?? 1);
    const page = Math.max(Number.isFinite(pageRaw) ? Math.floor(pageRaw) : 1, 1);
    const where = this.transactionWhere(query);

    const [rows, total, agg, credits, debits, typeGroups] = await Promise.all([
      this.prisma.coinTransaction.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, displayName: true, email: true, avatarUrl: true } },
        },
        orderBy: this.transactionOrder(query),
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.coinTransaction.count({ where }),
      this.prisma.coinTransaction.aggregate({
        where,
        _sum: { coinAmount: true, commissionAmount: true, netAmount: true },
      }),
      this.prisma.coinTransaction.aggregate({
        where: { AND: [where, { coinAmount: { gt: 0 } }] },
        _sum: { coinAmount: true },
        _count: { _all: true },
      }),
      this.prisma.coinTransaction.aggregate({
        where: { AND: [where, { coinAmount: { lt: 0 } }] },
        _sum: { coinAmount: true },
        _count: { _all: true },
      }),
      this.prisma.coinTransaction.groupBy({
        by: ['type'],
        _count: { _all: true },
        orderBy: { type: 'asc' },
      }),
    ]);

    const pages = Math.max(1, Math.ceil(total / limit));
    return {
      analytics: {
        count: total,
        credits_total: Number(credits._sum.coinAmount ?? 0n),
        credits_count: credits._count._all,
        debits_total: Math.abs(Number(debits._sum.coinAmount ?? 0n)),
        debits_count: debits._count._all,
        net_flow: Number(agg._sum.coinAmount ?? 0n),
        total_coins: Number(agg._sum.coinAmount ?? 0n),
        total_commission: Number(agg._sum.commissionAmount ?? 0n),
        total_net: Number(agg._sum.netAmount ?? 0n),
      },
      types: typeGroups.map((g) => ({ type: g.type, count: g._count._all })),
      transactions: rows.map((t) => ({
        id: Number(t.id),
        user_id: Number(t.userId),
        user_name: t.user.displayName ?? t.user.name,
        user_email: t.user.email,
        user_avatar: t.user.avatarUrl,
        type: t.type,
        title: t.title,
        amount: Number(t.coinAmount),
        net_amount: t.netAmount !== null ? Number(t.netAmount) : null,
        commission_amount: t.commissionAmount !== null ? Number(t.commissionAmount) : null,
        balance_after: t.balanceAfter !== null ? Number(t.balanceAfter) : null,
        reference_id: t.referenceId,
        status: t.status,
        meta: t.meta,
        created_at: t.createdAt.toISOString(),
      })),
      meta: { page, limit, total, pages },
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

  async exportTransactionsCsv(query: Record<string, string | undefined> = {}) {
    const rows = await this.prisma.coinTransaction.findMany({
      where: this.transactionWhere(query),
      take: 20000,
      include: { user: { select: { name: true, displayName: true, email: true } } },
      orderBy: this.transactionOrder(query),
    });
    const cell = (v: unknown) => `"${v === null || v === undefined ? '' : String(v).replace(/"/g, '""')}"`;
    const header =
      'ID,User ID,User Name,User Email,Type,Title,Amount,Commission,Net Amount,Balance After,Reference,Status,Created At\n';
    const lines = rows.map((t) =>
      [
        Number(t.id),
        Number(t.userId),
        t.user.displayName ?? t.user.name,
        t.user.email,
        t.type,
        t.title,
        Number(t.coinAmount),
        t.commissionAmount !== null ? Number(t.commissionAmount) : '',
        t.netAmount !== null ? Number(t.netAmount) : '',
        t.balanceAfter !== null ? Number(t.balanceAfter) : '',
        t.referenceId,
        t.status,
        t.createdAt.toISOString(),
      ]
        .map(cell)
        .join(','),
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

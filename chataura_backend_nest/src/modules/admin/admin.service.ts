import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { userForApi } from '../user/user.serializer';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard() {
    const today = this.startOfDay();
    const weekAgo = this.startOfWeek();

    const [
      users,
      liveRooms,
      giftsToday,
      rechargeToday,
      rechargeThisWeek,
      coinTxCount,
      volumeAgg,
      giftVolume,
      adminCredits,
      reports,
      pendingWithdrawals,
    ] = await Promise.all([
      this.prisma.user.count({ where: { accountStatus: 'active' } }),
      this.prisma.room.count({ where: { isLive: true } }),
      this.prisma.coinTransaction.aggregate({
        where: {
          type: 'GIFT',
          createdAt: { gte: today },
        },
        _sum: { coinAmount: true },
      }),
      this.prisma.coinPurchaseTransaction.aggregate({
        where: {
          status: 'success',
          createdAt: { gte: today },
        },
        _sum: { coinsCredited: true, amountMinor: true },
      }),
      this.prisma.coinPurchaseTransaction.aggregate({
        where: {
          status: 'success',
          createdAt: { gte: weekAgo },
        },
        _sum: { coinsCredited: true, amountMinor: true },
      }),
      this.prisma.coinTransaction.count(),
      this.prisma.coinTransaction.aggregate({
        _sum: { coinAmount: true, netAmount: true, commissionAmount: true },
      }),
      this.prisma.coinTransaction.aggregate({
        where: { type: 'GIFT' },
        _sum: { coinAmount: true },
      }),
      this.prisma.coinTransaction.aggregate({
        where: { type: { in: ['ADMIN_CREDIT', 'ADMIN_ADJUST'] } },
        _sum: { coinAmount: true },
      }),
      this.prisma.userReport.count(),
      this.prisma.withdrawalRequest.count({ where: { status: 'pending' } }),
    ]);

    const revToday = (rechargeToday._sum.amountMinor ?? 0) / 100;
    const revThisWeek = (rechargeThisWeek._sum.amountMinor ?? 0) / 100;

    const recentCommissions: {
      date: string;
      transactions: number;
      commission: number;
    }[] = [];
    for (let i = 0; i < 3; i++) {
      const dStart = new Date();
      dStart.setDate(dStart.getDate() - i);
      dStart.setHours(0, 0, 0, 0);
      const dEnd = new Date(dStart);
      dEnd.setDate(dEnd.getDate() + 1);

      const [count, agg] = await Promise.all([
        this.prisma.coinTransaction.count({
          where: { createdAt: { gte: dStart, lt: dEnd } },
        }),
        this.prisma.coinTransaction.aggregate({
          where: { createdAt: { gte: dStart, lt: dEnd } },
          _sum: { commissionAmount: true },
        }),
      ]);
      recentCommissions.push({
        date: dStart.toISOString().split('T')[0],
        transactions: count,
        commission: Number(agg._sum.commissionAmount ?? 0n),
      });
    }

    return {
      users,
      live_rooms: liveRooms,
      coin_burn_today: Number(giftsToday._sum.coinAmount ?? 0n),
      recharge_today: rechargeToday._sum.coinsCredited ?? 0,
      revenue_today: revToday,
      revenue_this_week: revThisWeek,
      coin_tx_count: coinTxCount,
      gross_volume: Number(volumeAgg._sum.coinAmount ?? 0n),
      net_volume: Number(volumeAgg._sum.netAmount ?? 0n),
      commission_total: Number(volumeAgg._sum.commissionAmount ?? 0n),
      gift_volume: Number(giftVolume._sum.coinAmount ?? 0n),
      admin_credits: Number(adminCredits._sum.coinAmount ?? 0n),
      reports,
      pending_withdrawals: pendingWithdrawals,
      recent_commissions: recentCommissions,
      total_coin_transactions: coinTxCount,
      financials: {
        total_coin_volume: Number(volumeAgg._sum.coinAmount ?? 0n),
        total_net_volume: Number(volumeAgg._sum.netAmount ?? 0n),
        total_commission_collected: Number(
          volumeAgg._sum.commissionAmount ?? 0n,
        ),
        total_gift_volume: Number(giftVolume._sum.coinAmount ?? 0n),
        total_admin_credits: Number(adminCredits._sum.coinAmount ?? 0n),
        revenue_today_inr: revToday,
        revenue_this_week_inr: revThisWeek,
        recent_daily_commissions: recentCommissions,
      },
      system: {
        pending_reports: reports,
        pending_withdrawals: pendingWithdrawals,
      },
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
      users: rows.map(userForApi),
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
        const [roomsHosted, giftsSent, recharges] = await Promise.all([
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
        ]);
        return {
          ...userForApi(u),
          business: {
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
    const w = await this.prisma.withdrawalRequest.update({
      where: { id },
      data: { status: 'approved' },
    });
    return { id: Number(w.id), status: w.status };
  }

  async rejectWithdrawal(id: bigint, reason?: string) {
    const w = await this.prisma.withdrawalRequest.update({
      where: { id },
      data: { status: 'rejected', note: reason ?? 'Rejected by admin' },
    });
    return { id: Number(w.id), status: w.status };
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

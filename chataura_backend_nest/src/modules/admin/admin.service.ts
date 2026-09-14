import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { userForApi } from '../user/user.serializer';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard() {
    const [
      users,
      liveRooms,
      giftsToday,
      rechargeToday,
      reports,
      pendingWithdrawals,
    ] = await Promise.all([
      this.prisma.user.count({ where: { accountStatus: 'active' } }),
      this.prisma.room.count({ where: { isLive: true } }),
      this.prisma.coinTransaction.aggregate({
        where: {
          type: 'GIFT',
          createdAt: { gte: this.startOfDay() },
        },
        _sum: { coinAmount: true },
      }),
      this.prisma.coinPurchaseTransaction.aggregate({
        where: {
          status: 'success',
          createdAt: { gte: this.startOfDay() },
        },
        _sum: { coinsCredited: true },
      }),
      this.prisma.userReport.count(),
      this.prisma.withdrawalRequest.count({ where: { status: 'pending' } }),
    ]);
    return {
      users,
      live_rooms: liveRooms,
      coin_burn_today: Number(giftsToday._sum.coinAmount ?? 0n),
      recharge_today: rechargeToday._sum.coinsCredited ?? 0,
      reports,
      pending_withdrawals: pendingWithdrawals,
    };
  }

  async users(q?: string, page = 1, limit = 20) {
    const take = Math.min(Math.max(limit, 1), 50);
    const skip = (Math.max(page, 1) - 1) * take;
    const where: Prisma.UserWhereInput = q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            { displayName: { contains: q, mode: 'insensitive' } },
            { name: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take,
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      users: rows.map((u) => userForApi(u)),
      meta: {
        total,
        page,
        last_page: Math.max(1, Math.ceil(total / take)),
        limit: take,
      },
    };
  }

  async suspend(id: bigint, reason?: string) {
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        isSuspended: true,
        accountStatus: 'suspended',
        suspendedReason: reason ?? 'admin',
      },
    });
    return userForApi(user);
  }

  async unsuspend(id: bigint) {
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        isSuspended: false,
        accountStatus: 'active',
        suspendedReason: null,
        suspendedUntil: null,
      },
    });
    return userForApi(user);
  }

  async setStar(id: bigint, isStar: boolean) {
    const user = await this.prisma.user.update({
      where: { id },
      data: { isStarAccount: isStar },
    });
    return userForApi(user);
  }

  async reports(page = 1, limit = 20) {
    const take = Math.min(Math.max(limit, 1), 50);
    const rows = await this.prisma.userReport.findMany({
      include: { reporter: true, reported: true },
      orderBy: { id: 'desc' },
      skip: (Math.max(page, 1) - 1) * take,
      take,
    });
    return {
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

  gifts() {
    return this.prisma.gift.findMany({ orderBy: { id: 'asc' } }).then((rows) =>
      rows.map((g) => ({
        id: Number(g.id),
        name: g.name,
        coin_cost: g.coinCost,
        image_url: g.imageUrl,
        is_active: g.isActive,
      })),
    );
  }

  async createGift(body: {
    name: string;
    coin_cost: number;
    image_url?: string;
  }) {
    const g = await this.prisma.gift.create({
      data: {
        name: body.name,
        coinCost: Number(body.coin_cost),
        imageUrl: body.image_url ?? null,
      },
    });
    return {
      id: Number(g.id),
      name: g.name,
      coin_cost: g.coinCost,
      image_url: g.imageUrl,
    };
  }

  async updateGift(
    id: bigint,
    body: { name?: string; coin_cost?: number; is_active?: boolean },
  ) {
    const g = await this.prisma.gift.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.coin_cost !== undefined
          ? { coinCost: Number(body.coin_cost) }
          : {}),
        ...(body.is_active !== undefined ? { isActive: body.is_active } : {}),
      },
    });
    return {
      id: Number(g.id),
      name: g.name,
      coin_cost: g.coinCost,
      is_active: g.isActive,
    };
  }

  async bannersAdmin() {
    const rows = await this.prisma.banner.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    return { banners: rows.map((b) => this.serializeBanner(b)) };
  }

  async createBanner(body: Record<string, unknown>) {
    const b = await this.prisma.banner.create({
      data: this.bannerData(body),
    });
    return this.serializeBanner(b);
  }

  async updateBanner(id: bigint, body: Record<string, unknown>) {
    const exists = await this.prisma.banner.findUnique({ where: { id } });
    if (!exists) {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Banner not found' },
      });
    }
    const b = await this.prisma.banner.update({
      where: { id },
      data: this.bannerData(body),
    });
    return this.serializeBanner(b);
  }

  async deleteBanner(id: bigint) {
    await this.prisma.banner.delete({ where: { id } });
    return { message: 'Deleted' };
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

  async packages() {
    const rows = await this.prisma.coinPackage.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return {
      packages: rows.map((p) => this.serializePackage(p)),
    };
  }

  async createPackage(body: {
    coins: number;
    price: number;
    currency?: string;
    audience?: string;
    original_price?: number;
  }) {
    const p = await this.prisma.coinPackage.create({
      data: {
        coins: Number(body.coins),
        price: body.price,
        currency: body.currency ?? 'INR',
        audience: body.audience ?? 'user',
        originalPrice: body.original_price ?? null,
      },
    });
    return this.serializePackage(p);
  }

  async updatePackage(
    id: bigint,
    body: {
      coins?: number;
      price?: number;
      is_active?: boolean;
      audience?: string;
    },
  ) {
    const p = await this.prisma.coinPackage.update({
      where: { id },
      data: {
        ...(body.coins !== undefined ? { coins: Number(body.coins) } : {}),
        ...(body.price !== undefined ? { price: body.price } : {}),
        ...(body.is_active !== undefined ? { isActive: body.is_active } : {}),
        ...(body.audience !== undefined ? { audience: body.audience } : {}),
      },
    });
    return this.serializePackage(p);
  }

  private serializePackage(p: {
    id: bigint;
    audience: string;
    coins: number;
    currency: string;
    price: { toString(): string };
    originalPrice: { toString(): string } | null;
    isActive: boolean;
    sortOrder: number;
  }) {
    return {
      id: Number(p.id),
      audience: p.audience,
      coins: p.coins,
      currency: p.currency,
      price: Number(p.price),
      original_price: p.originalPrice != null ? Number(p.originalPrice) : null,
      is_active: p.isActive,
      sort_order: p.sortOrder,
    };
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

  private startOfDay() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private bannerData(body: Record<string, unknown>): Prisma.BannerUncheckedCreateInput {
    return {
      title: String(body.title ?? 'Banner'),
      subtitle: body.subtitle != null ? String(body.subtitle) : undefined,
      category: body.category != null ? String(body.category) : undefined,
      badgeText: body.badge_text != null ? String(body.badge_text) : undefined,
      imageUrl: body.image_url != null ? String(body.image_url) : undefined,
      bgColorStart:
        body.bg_color_start != null ? String(body.bg_color_start) : undefined,
      bgColorEnd:
        body.bg_color_end != null ? String(body.bg_color_end) : undefined,
      buttonText:
        body.button_text != null ? String(body.button_text) : undefined,
      actionType:
        body.action_type != null ? String(body.action_type) : undefined,
      actionTarget:
        body.action_target != null ? String(body.action_target) : undefined,
      detailsContent:
        body.details_content != null ? String(body.details_content) : undefined,
      sortOrder:
        body.sort_order !== undefined ? Number(body.sort_order) : undefined,
      isActive:
        body.is_active !== undefined ? Boolean(body.is_active) : undefined,
    };
  }

  private serializeBanner(b: {
    id: bigint;
    title: string;
    subtitle: string | null;
    category: string;
    badgeText: string | null;
    imageUrl: string | null;
    bgColorStart: string | null;
    bgColorEnd: string | null;
    buttonText: string | null;
    actionType: string | null;
    actionTarget: string | null;
    detailsContent: string | null;
    sortOrder: number;
    isActive: boolean;
  }) {
    return {
      id: Number(b.id),
      title: b.title,
      subtitle: b.subtitle,
      category: b.category,
      badge_text: b.badgeText,
      image_url: b.imageUrl,
      bg_color_start: b.bgColorStart,
      bg_color_end: b.bgColorEnd,
      button_text: b.buttonText,
      action_type: b.actionType,
      action_target: b.actionTarget,
      details_content: b.detailsContent,
      sort_order: b.sortOrder,
      is_active: b.isActive,
    };
  }
}

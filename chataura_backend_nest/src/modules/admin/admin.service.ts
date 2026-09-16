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

  async gifts() {
    const rows = await this.prisma.gift.findMany({ orderBy: { id: 'asc' } });
    return {
      gifts: rows.map((g) => ({
        id: Number(g.id),
        name: g.name,
        coin_cost: g.coinCost,
        image_url: g.imageUrl,
        is_active: g.isActive,
      })),
    };
  }

  async createGift(body: {
    name: string;
    coin_cost?: number;
    coinCost?: number;
    image_url?: string;
    imageUrl?: string;
  }) {
    const cost = body.coin_cost ?? body.coinCost ?? 0;
    const img = body.image_url ?? body.imageUrl ?? null;
    const g = await this.prisma.gift.create({
      data: {
        name: body.name,
        coinCost: Number(cost),
        imageUrl: img,
      },
    });
    return {
      id: Number(g.id),
      name: g.name,
      coin_cost: g.coinCost,
      image_url: g.imageUrl,
      is_active: g.isActive,
    };
  }

  async updateGift(
    id: bigint,
    body: {
      name?: string;
      coin_cost?: number;
      coinCost?: number;
      image_url?: string;
      imageUrl?: string;
      is_active?: boolean;
    },
  ) {
    const cost = body.coin_cost ?? body.coinCost;
    const img = body.image_url ?? body.imageUrl;
    const g = await this.prisma.gift.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(cost !== undefined ? { coinCost: Number(cost) } : {}),
        ...(img !== undefined ? { imageUrl: img } : {}),
        ...(body.is_active !== undefined ? { isActive: body.is_active } : {}),
      },
    });
    return {
      id: Number(g.id),
      name: g.name,
      coin_cost: g.coinCost,
      image_url: g.imageUrl,
      is_active: g.isActive,
    };
  }

  async deleteGift(id: bigint) {
    await this.prisma.gift.delete({ where: { id } });
    return { message: 'Deleted' };
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

  async deletePackage(id: bigint) {
    await this.prisma.coinPackage.delete({ where: { id } });
    return { message: 'Deleted' };
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

  async resolveReport(id: bigint) {
    await this.prisma.userReport.delete({ where: { id } });
    return { message: 'Report resolved and removed' };
  }

  // Levels
  async levels() {
    const rows = await this.prisma.level.findMany({ orderBy: { level: 'asc' } });
    return {
      levels: rows.map((l) => ({
        id: l.id,
        level: l.level,
        min_xp: l.minXp,
        max_xp: l.maxXp,
        label: l.label,
        badge_url: l.badgeUrl,
        icon_url: l.iconUrl,
      })),
    };
  }

  async createLevel(body: {
    level: number;
    min_xp: number;
    max_xp: number;
    label?: string;
    badge_url?: string;
    icon_url?: string;
  }) {
    const l = await this.prisma.level.create({
      data: {
        level: Number(body.level),
        minXp: Number(body.min_xp),
        maxXp: Number(body.max_xp),
        label: body.label ?? null,
        badgeUrl: body.badge_url ?? null,
        iconUrl: body.icon_url ?? null,
      },
    });
    return {
      id: l.id,
      level: l.level,
      min_xp: l.minXp,
      max_xp: l.maxXp,
      label: l.label,
      badge_url: l.badgeUrl,
      icon_url: l.iconUrl,
    };
  }

  async updateLevel(
    id: number,
    body: {
      min_xp?: number;
      max_xp?: number;
      label?: string;
      badge_url?: string;
      icon_url?: string;
    },
  ) {
    const l = await this.prisma.level.update({
      where: { id },
      data: {
        ...(body.min_xp !== undefined ? { minXp: Number(body.min_xp) } : {}),
        ...(body.max_xp !== undefined ? { maxXp: Number(body.max_xp) } : {}),
        ...(body.label !== undefined ? { label: body.label } : {}),
        ...(body.badge_url !== undefined ? { badgeUrl: body.badge_url } : {}),
        ...(body.icon_url !== undefined ? { iconUrl: body.icon_url } : {}),
      },
    });
    return {
      id: l.id,
      level: l.level,
      min_xp: l.minXp,
      max_xp: l.maxXp,
      label: l.label,
      badge_url: l.badgeUrl,
      icon_url: l.iconUrl,
    };
  }

  async deleteLevel(id: number) {
    await this.prisma.level.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  // Frames & Role Frames
  async frames(category?: string) {
    const where: Prisma.FrameWhereInput = category ? { category } : {};
    const rows = await this.prisma.frame.findMany({
      where,
      orderBy: { id: 'asc' },
    });
    return {
      frames: rows.map((f) => ({
        id: Number(f.id),
        name: f.name,
        slug: f.slug,
        category: f.category,
        level_required: f.levelRequired,
        coin_cost: f.coinCost,
        is_premium: f.isPremium,
        is_active: f.isActive,
        image_url: f.imageUrl,
        animation_key: f.animationKey,
      })),
    };
  }

  async createFrame(body: {
    name: string;
    category?: string;
    level_required?: number;
    coin_cost?: number;
    is_premium?: boolean;
    image_url?: string;
    animation_key?: string;
  }) {
    const f = await this.prisma.frame.create({
      data: {
        name: body.name,
        category: body.category ?? 'avatar',
        levelRequired: Number(body.level_required ?? 1),
        coinCost: body.coin_cost !== undefined && body.coin_cost !== null ? Number(body.coin_cost) : null,
        isPremium: Boolean(body.is_premium ?? false),
        imageUrl: body.image_url ?? null,
        animationKey: body.animation_key ?? null,
      },
    });
    return {
      id: Number(f.id),
      name: f.name,
      category: f.category,
      level_required: f.levelRequired,
      coin_cost: f.coinCost,
      is_premium: f.isPremium,
      image_url: f.imageUrl,
      is_active: f.isActive,
    };
  }

  async updateFrame(
    id: bigint,
    body: {
      name?: string;
      category?: string;
      level_required?: number;
      coin_cost?: number;
      is_premium?: boolean;
      is_active?: boolean;
      image_url?: string;
      animation_key?: string;
    },
  ) {
    const f = await this.prisma.frame.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.level_required !== undefined
          ? { levelRequired: Number(body.level_required) }
          : {}),
        ...(body.coin_cost !== undefined
          ? { coinCost: body.coin_cost !== null ? Number(body.coin_cost) : null }
          : {}),
        ...(body.is_premium !== undefined
          ? { isPremium: Boolean(body.is_premium) }
          : {}),
        ...(body.is_active !== undefined
          ? { isActive: Boolean(body.is_active) }
          : {}),
        ...(body.image_url !== undefined ? { imageUrl: body.image_url } : {}),
        ...(body.animation_key !== undefined
          ? { animationKey: body.animation_key }
          : {}),
      },
    });
    return {
      id: Number(f.id),
      name: f.name,
      category: f.category,
      is_active: f.isActive,
    };
  }

  async deleteFrame(id: bigint) {
    await this.prisma.frame.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  // Entry Bars
  async entryBars() {
    const rows = await this.prisma.entryBar.findMany({ orderBy: { id: 'asc' } });
    return {
      entry_bars: rows.map((eb) => ({
        id: Number(eb.id),
        name: eb.name,
        level_required: eb.levelRequired,
        image_url: eb.imageUrl,
        is_active: eb.isActive,
      })),
    };
  }

  async createEntryBar(body: {
    name: string;
    level_required?: number;
    image_url?: string;
  }) {
    const eb = await this.prisma.entryBar.create({
      data: {
        name: body.name,
        levelRequired: Number(body.level_required ?? 1),
        imageUrl: body.image_url ?? null,
      },
    });
    return {
      id: Number(eb.id),
      name: eb.name,
      level_required: eb.levelRequired,
      image_url: eb.imageUrl,
      is_active: eb.isActive,
    };
  }

  async updateEntryBar(
    id: bigint,
    body: {
      name?: string;
      level_required?: number;
      image_url?: string;
      is_active?: boolean;
    },
  ) {
    const eb = await this.prisma.entryBar.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.level_required !== undefined
          ? { levelRequired: Number(body.level_required) }
          : {}),
        ...(body.image_url !== undefined ? { imageUrl: body.image_url } : {}),
        ...(body.is_active !== undefined
          ? { isActive: Boolean(body.is_active) }
          : {}),
      },
    });
    return { id: Number(eb.id), name: eb.name, is_active: eb.isActive };
  }

  async deleteEntryBar(id: bigint) {
    await this.prisma.entryBar.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  // Room Themes
  async roomThemes() {
    const rows = await this.prisma.roomTheme.findMany({ orderBy: { id: 'asc' } });
    return {
      room_themes: rows.map((rt) => ({
        id: Number(rt.id),
        name: rt.name,
        image_url: rt.imageUrl,
        coin_cost: rt.coinCost,
        is_active: rt.isActive,
      })),
    };
  }

  async createRoomTheme(body: {
    name: string;
    coin_cost?: number;
    image_url?: string;
  }) {
    const rt = await this.prisma.roomTheme.create({
      data: {
        name: body.name,
        coinCost: Number(body.coin_cost ?? 0),
        imageUrl: body.image_url ?? null,
      },
    });
    return {
      id: Number(rt.id),
      name: rt.name,
      coin_cost: rt.coinCost,
      image_url: rt.imageUrl,
      is_active: rt.isActive,
    };
  }

  async updateRoomTheme(
    id: bigint,
    body: {
      name?: string;
      coin_cost?: number;
      image_url?: string;
      is_active?: boolean;
    },
  ) {
    const rt = await this.prisma.roomTheme.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.coin_cost !== undefined
          ? { coinCost: Number(body.coin_cost) }
          : {}),
        ...(body.image_url !== undefined ? { imageUrl: body.image_url } : {}),
        ...(body.is_active !== undefined
          ? { isActive: Boolean(body.is_active) }
          : {}),
      },
    });
    return { id: Number(rt.id), name: rt.name, is_active: rt.isActive };
  }

  async deleteRoomTheme(id: bigint) {
    await this.prisma.roomTheme.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  // Stickers
  async stickers() {
    const rows = await this.prisma.sticker.findMany({ orderBy: { id: 'asc' } });
    return {
      stickers: rows.map((s) => ({
        id: Number(s.id),
        name: s.name,
        coin_cost: s.coinCost,
        image_url: s.imageUrl,
        animation_url: s.animationUrl,
        is_active: s.isActive,
      })),
    };
  }

  async createSticker(body: {
    name: string;
    coin_cost?: number;
    image_url?: string;
    animation_url?: string;
  }) {
    const s = await this.prisma.sticker.create({
      data: {
        name: body.name,
        coinCost: Number(body.coin_cost ?? 0),
        imageUrl: body.image_url ?? null,
        animationUrl: body.animation_url ?? null,
      },
    });
    return {
      id: Number(s.id),
      name: s.name,
      coin_cost: s.coinCost,
      image_url: s.imageUrl,
      is_active: s.isActive,
    };
  }

  async updateSticker(
    id: bigint,
    body: {
      name?: string;
      coin_cost?: number;
      image_url?: string;
      animation_url?: string;
      is_active?: boolean;
    },
  ) {
    const s = await this.prisma.sticker.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.coin_cost !== undefined
          ? { coinCost: Number(body.coin_cost) }
          : {}),
        ...(body.image_url !== undefined ? { imageUrl: body.image_url } : {}),
        ...(body.animation_url !== undefined
          ? { animationUrl: body.animation_url }
          : {}),
        ...(body.is_active !== undefined
          ? { isActive: Boolean(body.is_active) }
          : {}),
      },
    });
    return { id: Number(s.id), name: s.name, is_active: s.isActive };
  }

  async deleteSticker(id: bigint) {
    await this.prisma.sticker.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  // Settings
  async settings() {
    let setting = await this.prisma.adminSetting.findUnique({ where: { id: 1 } });
    if (!setting) {
      setting = await this.prisma.adminSetting.create({
        data: { id: 1 },
      });
    }
    return {
      settings: {
        id: setting.id,
        gems_per_coin: Number(setting.gemsPerCoin),
        min_gems_convert_to_coins: setting.minGemsConvertToCoins,
        coin_to_xp_ratio: Number(setting.coinToXpRatio),
        gift_commission_pct: Number(setting.giftCommissionPct),
        earnings_purchase_enabled: setting.earningsPurchaseEnabled,
        cashout_enabled: setting.cashoutEnabled,
        audio_call_price_per_min: setting.audioCallPricePerMin,
        video_call_price_per_min: setting.videoCallPricePerMin,
        star_chat_price_per_min: setting.starChatPricePerMin,
        star_chat_commission_pct: Number(setting.starChatCommissionPct),
        star_chat_heartbeat_sec: setting.starChatHeartbeatSec,
        spin_cost: setting.spinCost,
        bonus_config: setting.bonusConfig,
      },
    };
  }

  async updateSettings(body: Record<string, unknown>) {
    const data: Prisma.AdminSettingUpdateInput = {};
    if (body.gift_commission_pct !== undefined)
      data.giftCommissionPct = Number(body.gift_commission_pct);
    if (body.star_chat_commission_pct !== undefined)
      data.starChatCommissionPct = Number(body.star_chat_commission_pct);
    if (body.cashout_enabled !== undefined)
      data.cashoutEnabled = Boolean(body.cashout_enabled);
    if (body.earnings_purchase_enabled !== undefined)
      data.earningsPurchaseEnabled = Boolean(body.earnings_purchase_enabled);
    if (body.gems_per_coin !== undefined)
      data.gemsPerCoin = Number(body.gems_per_coin);
    if (body.coin_to_xp_ratio !== undefined)
      data.coinToXpRatio = Number(body.coin_to_xp_ratio);
    if (body.audio_call_price_per_min !== undefined)
      data.audioCallPricePerMin = Number(body.audio_call_price_per_min);
    if (body.video_call_price_per_min !== undefined)
      data.videoCallPricePerMin = Number(body.video_call_price_per_min);
    if (body.star_chat_price_per_min !== undefined)
      data.starChatPricePerMin = Number(body.star_chat_price_per_min);
    if (body.spin_cost !== undefined)
      data.spinCost = Number(body.spin_cost);
    if (body.bonus_config !== undefined)
      data.bonusConfig = body.bonus_config as Prisma.InputJsonValue;

    const setting = await this.prisma.adminSetting.upsert({
      where: { id: 1 },
      create: { id: 1, ...(data as Prisma.AdminSettingCreateInput) },
      update: data,
    });
    return {
      settings: {
        id: setting.id,
        gems_per_coin: Number(setting.gemsPerCoin),
        gift_commission_pct: Number(setting.giftCommissionPct),
        star_chat_commission_pct: Number(setting.starChatCommissionPct),
        cashout_enabled: setting.cashoutEnabled,
        earnings_purchase_enabled: setting.earningsPurchaseEnabled,
        spin_cost: setting.spinCost,
        coin_to_xp_ratio: Number(setting.coinToXpRatio),
        audio_call_price_per_min: setting.audioCallPricePerMin,
        video_call_price_per_min: setting.videoCallPricePerMin,
      },
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

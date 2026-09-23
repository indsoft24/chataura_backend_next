import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { resolve } from 'path';
import {
  classifyMediaUrl,
  resolveCatalogMedia,
} from '../../common/utils/catalog-media';
import { extractVideoPoster } from '../../common/utils/video-poster';
import { PrismaService } from '../../common/prisma/prisma.service';

function blankToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

@Injectable()
export class AdminCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private async pairCatalogMedia(
    image: string | null | undefined,
    animation: string | null | undefined,
  ): Promise<{ imageUrl: string | null; animationUrl: string | null }> {
    let imageUrl = blankToNull(image);
    let animationUrl = blankToNull(animation);
    if (imageUrl && classifyMediaUrl(imageUrl) === 'video') {
      if (!animationUrl) animationUrl = imageUrl;
      imageUrl = null;
    }
    if (!imageUrl && animationUrl && classifyMediaUrl(animationUrl) === 'video') {
      const poster = await extractVideoPoster({
        videoUrl: animationUrl,
        uploadsDir: resolve(process.cwd(), 'uploads'),
        publicBase: this.config.get<string>(
          'PUBLIC_BASE_URL',
          'http://localhost:3000',
        ),
      });
      if (poster) imageUrl = poster;
    }
    return { imageUrl, animationUrl };
  }

  // ──────────────────────────────────────────────
  // Packages
  // ──────────────────────────────────────────────

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

  // ──────────────────────────────────────────────
  // Gifts
  // ──────────────────────────────────────────────

  async gifts() {
    const rows = await this.prisma.gift.findMany({ orderBy: { id: 'asc' } });
    return {
      gifts: rows.map((g) => {
        const media = resolveCatalogMedia(g.imageUrl, g.animationUrl);
        return {
          id: Number(g.id),
          name: g.name,
          coin_cost: g.coinCost,
          image_url: g.imageUrl,
          animation_url: g.animationUrl,
          media_type: media.media_type,
          loop: media.loop,
          is_active: g.isActive,
        };
      }),
    };
  }

  async createGift(body: {
    name: string;
    coin_cost?: number;
    coinCost?: number;
    image_url?: string;
    imageUrl?: string;
    animation_url?: string;
    animationUrl?: string;
    video_url?: string;
  }) {
    const cost = body.coin_cost ?? body.coinCost ?? 0;
    const paired = await this.pairCatalogMedia(
      body.image_url ?? body.imageUrl,
      body.animation_url ?? body.animationUrl ?? body.video_url,
    );
    const g = await this.prisma.gift.create({
      data: {
        name: body.name,
        coinCost: Number(cost),
        imageUrl: paired.imageUrl,
        animationUrl: paired.animationUrl,
      },
    });
    return {
      id: Number(g.id),
      name: g.name,
      coin_cost: g.coinCost,
      image_url: g.imageUrl,
      animation_url: g.animationUrl,
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
      animation_url?: string;
      animationUrl?: string;
      video_url?: string;
      is_active?: boolean;
    },
  ) {
    const cost = body.coin_cost ?? body.coinCost;
    const img = body.image_url ?? body.imageUrl;
    const anim = body.animation_url ?? body.animationUrl ?? body.video_url;
    let mediaPatch: { imageUrl: string | null; animationUrl: string | null } | null =
      null;
    if (img !== undefined || anim !== undefined) {
      const existing = await this.prisma.gift.findUnique({
        where: { id },
        select: { imageUrl: true, animationUrl: true },
      });
      mediaPatch = await this.pairCatalogMedia(
        img !== undefined ? img : existing?.imageUrl,
        anim !== undefined ? anim : existing?.animationUrl,
      );
    }
    const g = await this.prisma.gift.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(cost !== undefined ? { coinCost: Number(cost) } : {}),
        ...(mediaPatch
          ? {
              imageUrl: mediaPatch.imageUrl,
              animationUrl: mediaPatch.animationUrl,
            }
          : {}),
        ...(body.is_active !== undefined ? { isActive: body.is_active } : {}),
      },
    });
    return {
      id: Number(g.id),
      name: g.name,
      coin_cost: g.coinCost,
      image_url: g.imageUrl,
      animation_url: g.animationUrl,
      is_active: g.isActive,
    };
  }

  async deleteGift(id: bigint) {
    await this.prisma.gift.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  // ──────────────────────────────────────────────
  // Banners
  // ──────────────────────────────────────────────

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

  private bannerData(
    body: Record<string, unknown>,
  ): Prisma.BannerUncheckedCreateInput {
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

  // ──────────────────────────────────────────────
  // Levels
  // ──────────────────────────────────────────────

  async levels() {
    const rows = await this.prisma.level.findMany({
      orderBy: { level: 'asc' },
    });
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

  // ──────────────────────────────────────────────
  // Frames & Role Frames
  // ──────────────────────────────────────────────

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
        animation_url: f.animationUrl,
        animation_key: f.animationKey,
        composite_mode: f.compositeMode,
        media_type: resolveCatalogMedia(f.imageUrl, f.animationUrl).media_type,
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
    animation_url?: string;
    animation_key?: string;
    composite_mode?: string;
  }) {
    const paired = await this.pairCatalogMedia(body.image_url, body.animation_url);
    const composite =
      body.composite_mode === 'screen' || body.composite_mode === 'alpha'
        ? body.composite_mode
        : classifyMediaUrl(paired.animationUrl) === 'video' &&
            paired.animationUrl?.toLowerCase().includes('.mp4')
          ? 'screen'
          : 'alpha';
    const f = await this.prisma.frame.create({
      data: {
        name: body.name,
        category: body.category ?? 'avatar',
        levelRequired: Number(body.level_required ?? 1),
        coinCost:
          body.coin_cost !== undefined && body.coin_cost !== null
            ? Number(body.coin_cost)
            : null,
        isPremium: Boolean(body.is_premium ?? false),
        imageUrl: paired.imageUrl,
        animationUrl: paired.animationUrl,
        animationKey: body.animation_key ?? null,
        compositeMode: composite,
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
      animation_url: f.animationUrl,
      composite_mode: f.compositeMode,
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
      animation_url?: string;
      animation_key?: string;
      composite_mode?: string;
    },
  ) {
    let mediaPatch: { imageUrl: string | null; animationUrl: string | null } | null =
      null;
    let compositePatch: string | undefined;
    if (
      body.image_url !== undefined ||
      body.animation_url !== undefined ||
      body.composite_mode !== undefined
    ) {
      const existing = await this.prisma.frame.findUnique({
        where: { id },
        select: { imageUrl: true, animationUrl: true, compositeMode: true },
      });
      mediaPatch = await this.pairCatalogMedia(
        body.image_url !== undefined ? body.image_url : existing?.imageUrl,
        body.animation_url !== undefined
          ? body.animation_url
          : existing?.animationUrl,
      );
      if (body.composite_mode === 'screen' || body.composite_mode === 'alpha') {
        compositePatch = body.composite_mode;
      } else if (body.animation_url !== undefined) {
        compositePatch =
          classifyMediaUrl(mediaPatch.animationUrl) === 'video' &&
          mediaPatch.animationUrl?.toLowerCase().includes('.mp4')
            ? 'screen'
            : 'alpha';
      }
    }
    const f = await this.prisma.frame.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.level_required !== undefined
          ? { levelRequired: Number(body.level_required) }
          : {}),
        ...(body.coin_cost !== undefined
          ? {
              coinCost: body.coin_cost !== null ? Number(body.coin_cost) : null,
            }
          : {}),
        ...(body.is_premium !== undefined
          ? { isPremium: Boolean(body.is_premium) }
          : {}),
        ...(body.is_active !== undefined
          ? { isActive: Boolean(body.is_active) }
          : {}),
        ...(mediaPatch
          ? {
              imageUrl: mediaPatch.imageUrl,
              animationUrl: mediaPatch.animationUrl,
            }
          : {}),
        ...(compositePatch !== undefined
          ? { compositeMode: compositePatch }
          : {}),
        ...(body.animation_key !== undefined
          ? { animationKey: body.animation_key }
          : {}),
      },
    });
    return {
      id: Number(f.id),
      name: f.name,
      category: f.category,
      image_url: f.imageUrl,
      animation_url: f.animationUrl,
      composite_mode: f.compositeMode,
      is_active: f.isActive,
    };
  }

  async deleteFrame(id: bigint) {
    await this.prisma.frame.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  // ──────────────────────────────────────────────
  // Entry Bars
  // ──────────────────────────────────────────────

  async entryBars() {
    const rows = await this.prisma.entryBar.findMany({
      orderBy: { id: 'asc' },
    });
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

  // ──────────────────────────────────────────────
  // Room Themes
  // ──────────────────────────────────────────────

  async roomThemes() {
    const rows = await this.prisma.roomTheme.findMany({
      orderBy: { id: 'asc' },
    });
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

  // ──────────────────────────────────────────────
  // Stickers
  // ──────────────────────────────────────────────

  async stickers() {
    const rows = await this.prisma.sticker.findMany({ orderBy: { id: 'asc' } });
    return {
      stickers: rows.map((s) => ({
        id: Number(s.id),
        name: s.name,
        coin_cost: s.coinCost,
        image_url: s.imageUrl,
        animation_url: s.animationUrl,
        media_type: resolveCatalogMedia(s.imageUrl, s.animationUrl).media_type,
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
    const paired = await this.pairCatalogMedia(body.image_url, body.animation_url);
    const s = await this.prisma.sticker.create({
      data: {
        name: body.name,
        coinCost: Number(body.coin_cost ?? 0),
        imageUrl: paired.imageUrl,
        animationUrl: paired.animationUrl,
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
    let mediaPatch: { imageUrl: string | null; animationUrl: string | null } | null =
      null;
    if (body.image_url !== undefined || body.animation_url !== undefined) {
      const existing = await this.prisma.sticker.findUnique({
        where: { id },
        select: { imageUrl: true, animationUrl: true },
      });
      mediaPatch = await this.pairCatalogMedia(
        body.image_url !== undefined ? body.image_url : existing?.imageUrl,
        body.animation_url !== undefined
          ? body.animation_url
          : existing?.animationUrl,
      );
    }
    const s = await this.prisma.sticker.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.coin_cost !== undefined
          ? { coinCost: Number(body.coin_cost) }
          : {}),
        ...(mediaPatch
          ? {
              imageUrl: mediaPatch.imageUrl,
              animationUrl: mediaPatch.animationUrl,
            }
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

  // ──────────────────────────────────────────────
  // Settings
  // ──────────────────────────────────────────────

  async settings() {
    let setting = await this.prisma.adminSetting.findUnique({
      where: { id: 1 },
    });
    if (!setting) {
      setting = await this.prisma.adminSetting.create({
        data: { id: 1 },
      });
    }
    const extra = (setting.extraSettings as Record<string, unknown>) ?? {};
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
        // Laravel parity settings
        gift_commission_percent: Number(setting.giftCommissionPct),
        audio_call_commission_percent: extra.audio_call_commission_percent ?? 20,
        video_call_commission_percent: extra.video_call_commission_percent ?? 20,
        star_chat_commission_percent: Number(setting.starChatCommissionPct),
        min_withdrawal: extra.min_withdrawal ?? 100,
        max_withdrawal: extra.max_withdrawal ?? 50000,
        inr_per_usd: extra.inr_per_usd ?? 83.5,
        gems_per_rupee: extra.gems_per_rupee ?? 10,
        gems_per_dollar: extra.gems_per_dollar ?? 835,
        min_gems_convert: extra.min_gems_convert ?? 100,
        min_inr_withdrawal: extra.min_inr_withdrawal ?? 100,
        max_inr_withdrawal: extra.max_inr_withdrawal ?? 50000,
        streak_enabled: extra.streak_enabled ?? true,
        streak_day_1_coins: extra.streak_day_1_coins ?? 10,
        streak_day_2_coins: extra.streak_day_2_coins ?? 20,
        streak_day_3_coins: extra.streak_day_3_coins ?? 30,
        streak_day_4_coins: extra.streak_day_4_coins ?? 40,
        streak_day_5_coins: extra.streak_day_5_coins ?? 50,
        streak_day_6_coins: extra.streak_day_6_coins ?? 60,
        streak_day_7_coins: extra.streak_day_7_coins ?? 100,
        referral_reward_referrer: extra.referral_reward_referrer ?? 50,
        referral_reward_referee: extra.referral_reward_referee ?? 50,
        referral_coin_conversion_rate: extra.referral_coin_conversion_rate ?? 1,
        admob_enabled: extra.admob_enabled ?? false,
        admob_ad_coins: extra.admob_ad_coins ?? 10,
        admob_daily_ad_limit: extra.admob_daily_ad_limit ?? 5,
        game_1_enabled: extra.game_1_enabled ?? true,
        game_2_enabled: extra.game_2_enabled ?? true,
        game_3_enabled: extra.game_3_enabled ?? true,
        agency_cashback_enabled: extra.agency_cashback_enabled ?? true,
        agency_cashback_threshold_coins: extra.agency_cashback_threshold_coins ?? 2000,
        staff_commission_ceo_percent: extra.staff_commission_ceo_percent ?? 5,
        staff_commission_manager_percent: extra.staff_commission_manager_percent ?? 3,
        staff_commission_admin_percent: extra.staff_commission_admin_percent ?? 2,
        room_gift_big_animation_threshold_coins: extra.room_gift_big_animation_threshold_coins ?? 5000,
        room_gift_banner_duration_small_ms: extra.room_gift_banner_duration_small_ms ?? 3000,
        room_gift_banner_duration_big_ms: extra.room_gift_banner_duration_big_ms ?? 6000,
        room_video_enabled: extra.room_video_enabled !== false,
      },
    };
  }

  async updateSettings(body: Record<string, unknown>) {
    const data: Prisma.AdminSettingUpdateInput = {};
    if (body.gift_commission_pct !== undefined || body.gift_commission_percent !== undefined)
      data.giftCommissionPct = Number(body.gift_commission_pct ?? body.gift_commission_percent);
    if (body.star_chat_commission_pct !== undefined || body.star_chat_commission_percent !== undefined)
      data.starChatCommissionPct = Number(body.star_chat_commission_pct ?? body.star_chat_commission_percent);
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
    if (body.spin_cost !== undefined) data.spinCost = Number(body.spin_cost);
    if (body.bonus_config !== undefined)
      data.bonusConfig = body.bonus_config as Prisma.InputJsonValue;

    // Merge extra settings
    const current = await this.prisma.adminSetting.findUnique({ where: { id: 1 } });
    const existingExtra = (current?.extraSettings as Record<string, unknown>) ?? {};
    data.extraSettings = {
      ...existingExtra,
      ...body,
    } as Prisma.InputJsonValue;

    const setting = await this.prisma.adminSetting.upsert({
      where: { id: 1 },
      create: { id: 1, ...(data as Prisma.AdminSettingCreateInput) },
      update: data,
    });
    return this.settings();
  }

  // ──────────────────────────────────────────────
  // Countries
  // ──────────────────────────────────────────────

  async countries() {
    const rows = await this.prisma.country.findMany({ orderBy: { name: 'asc' } });
    return {
      countries: rows.map((c) => ({
        id: c.id,
        name: c.name,
        flag_emoji: c.flagEmoji,
        flag_url: c.flagUrl,
        approval_status: c.approvalStatus,
        is_active: c.isActive,
      })),
      pendingCount: rows.filter((c) => c.approvalStatus === 'pending').length,
    };
  }

  async createCountry(body: {
    id: string;
    name: string;
    flag_emoji?: string;
    flag_url?: string;
  }) {
    const c = await this.prisma.country.create({
      data: {
        id: body.id.trim().toUpperCase(),
        name: body.name.trim(),
        flagEmoji: body.flag_emoji ?? null,
        flagUrl: body.flag_url ?? null,
        approvalStatus: 'approved',
        isActive: true,
      },
    });
    return { country: c };
  }

  async updateCountry(
    id: string,
    body: {
      name?: string;
      flag_emoji?: string;
      flag_url?: string;
      is_active?: boolean;
    },
  ) {
    const c = await this.prisma.country.update({
      where: { id: id.toUpperCase() },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.flag_emoji !== undefined ? { flagEmoji: body.flag_emoji } : {}),
        ...(body.flag_url !== undefined ? { flagUrl: body.flag_url } : {}),
        ...(body.is_active !== undefined ? { isActive: body.is_active } : {}),
      },
    });
    return { country: c };
  }

  async deleteCountry(id: string) {
    await this.prisma.country.delete({ where: { id: id.toUpperCase() } });
    return { message: 'Country deleted' };
  }

  async approveCountry(id: string) {
    const c = await this.prisma.country.update({
      where: { id: id.toUpperCase() },
      data: { approvalStatus: 'approved' },
    });
    return { country: c };
  }

  async rejectCountry(id: string) {
    const c = await this.prisma.country.update({
      where: { id: id.toUpperCase() },
      data: { approvalStatus: 'rejected' },
    });
    return { country: c };
  }
}

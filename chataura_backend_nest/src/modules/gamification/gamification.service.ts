import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { presentFrameMedia } from '../../common/utils/catalog-media';
import { LedgerService } from '../wallet/ledger.service';
import {
  bandForXp,
  ensureLaravelLevelBands,
} from './level-bands';

@Injectable()
export class GamificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  async ensureDefaultLevels() {
    await ensureLaravelLevelBands(this.prisma);
  }

  levelPayload(
    user: {
      level: number;
      xp: number | bigint;
    },
    levelRow?: {
      minXp: number | bigint;
      maxXp: number | bigint;
      label: string | null;
      badgeUrl: string | null;
      iconUrl: string | null;
      level?: number;
    } | null,
    levelUp = false,
  ) {
    const userXp = Number(user.xp);
    const band = bandForXp(
      userXp,
      levelRow
        ? [
            {
              level: levelRow.level ?? user.level,
              minXp: levelRow.minXp,
              maxXp: levelRow.maxXp,
              label: levelRow.label,
            },
          ]
        : [],
    );
    return {
      level: band.level,
      current_level: band.level,
      xp: userXp,
      exp: userXp,
      current_xp: userXp,
      xp_progress_pct: band.xpProgressPct,
      level_min_xp: band.minXp,
      level_max_xp: band.maxXp,
      level_up: levelUp,
      label: levelRow?.label ?? band.label,
      level_label: levelRow?.label ?? band.label,
      badge_url: levelRow?.badgeUrl ?? null,
      icon_url: levelRow?.iconUrl ?? null,
    };
  }

  async getLevel(userId: bigint) {
    await this.ensureDefaultLevels();
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const row = await this.prisma.level.findFirst({
      where: { minXp: { lte: user.xp }, maxXp: { gte: user.xp } },
      orderBy: { level: 'desc' },
    });
    return this.levelPayload(user, row);
  }

  async catalog(userId: bigint) {
    await this.ensureDefaultLevels();
    const levels = await this.prisma.level.findMany({
      orderBy: { level: 'asc' },
    });
    const current = await this.getLevel(userId);
    return {
      levels: levels.map((l) => ({
        level: l.level,
        min_xp: l.minXp,
        max_xp: l.maxXp,
        label: l.label,
        badge_url: l.badgeUrl,
        icon_url: l.iconUrl,
      })),
      current,
    };
  }

  async addXp(userId: bigint, amount: number) {
    if (!Number.isFinite(amount) || amount < 1 || amount > 10000) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'INVALID_AMOUNT',
          message: 'amount must be between 1 and 10000',
        },
      });
    }
    await this.ensureDefaultLevels();

    return this.prisma.$transaction(async (tx) => {
      const locked = await this.ledger.lockUser(tx, userId);
      if (!locked) throw new NotFoundException('User not found');
      const newXp = Number(locked.xp) + Math.floor(amount);
      const levelRow = await tx.level.findFirst({
        where: { minXp: { lte: newXp }, maxXp: { gte: newXp } },
        orderBy: { level: 'desc' },
      });
      const newLevel = levelRow?.level ?? locked.level;
      const levelUp = newLevel > locked.level;

      await tx.user.update({
        where: { id: userId },
        data: { xp: newXp, exp: newXp, level: newLevel },
      });

      if (levelUp) {
        await this.ledger.unlockLevelFrames(tx, userId, newLevel);
      }

      return this.levelPayload(
        { level: newLevel, xp: newXp },
        levelRow,
        levelUp,
      );
    });
  }

  private frameOwned(row?: { expiresAt: Date | null } | null) {
    if (!row) return false;
    if (!row.expiresAt) return true;
    return row.expiresAt.getTime() > Date.now();
  }

  async frames(userId: bigint) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    await this.ledger.unlockLevelFrames(this.prisma, userId, user.level);
    let all = await this.prisma.frame.findMany({
      where: { isActive: true },
      orderBy: [{ levelRequired: 'asc' }, { id: 'asc' }],
    });

    if (all.length === 0) {
      const defaultFrames = [
        { name: 'Cosmic Wings', slug: 'cosmic_galaxy_wings_cutout', coinCost: 1500, levelRequired: 1, category: 'avatar' },
        { name: 'Royal Gold Crest', slug: 'royal_gold_crest_gemini_cutout', coinCost: 1200, levelRequired: 2, category: 'avatar' },
        { name: 'Flame Phoenix', slug: 'flame_phoenix_wreath_cutout', coinCost: 1500, levelRequired: 3, category: 'avatar' },
        { name: 'Golden Twin Dragons', slug: 'golden_twin_dragons_cutout', coinCost: 2000, levelRequired: 4, category: 'avatar' },
        { name: 'Mythic Griffin', slug: 'mythic_griffin_purple_cutout', coinCost: 1500, levelRequired: 5, category: 'avatar' },
        { name: 'Sapphire Ice Wings', slug: 'sapphire_ice_wings_cutout', coinCost: 1000, levelRequired: 6, category: 'avatar' },
        { name: 'Dragon Slayer', slug: 'dragon_slayer_crest_cutout', coinCost: 1000, levelRequired: 7, category: 'avatar' },
        { name: 'Holy Angel Wings', slug: 'angel_wings_holy_cutout', coinCost: 1200, levelRequired: 8, category: 'avatar' },
        { name: 'Fire Dragon', slug: 'fire_dragon_ouroboros_cutout', coinCost: 1000, levelRequired: 9, category: 'avatar' },
        { name: 'Glacial Dragon', slug: 'ice_glacial_dragon_cutout', coinCost: 1000, levelRequired: 10, category: 'avatar' },
        { name: 'Emerald Jade Dragon', slug: 'emerald_jade_dragon_cutout', coinCost: 1000, levelRequired: 11, category: 'avatar' },
        { name: 'Demon Knight', slug: 'skull_demon_knight_cutout', coinCost: 900, levelRequired: 12, category: 'avatar' },
        { name: 'Peacock Cobra', slug: 'peacock_cobra_crest_cutout', coinCost: 1200, levelRequired: 13, category: 'avatar' },
        { name: 'Peacock CEO', slug: 'peacock_ceo_text_cutout', coinCost: 1500, levelRequired: 14, category: 'avatar' },
        { name: 'Amethyst Crown', slug: 'violet_amethyst_crown_cutout', coinCost: 600, levelRequired: 15, category: 'avatar' },
        { name: 'Royal Laurel', slug: 'emerald_royal_laurel_cutout', coinCost: 600, levelRequired: 16, category: 'avatar' },
        { name: 'Celestial Saturn', slug: 'celestial_saturn_ring_cutout', coinCost: 750, levelRequired: 17, category: 'avatar' },
        { name: 'Neon Devil', slug: 'neon_devil_horns_tail_cutout', coinCost: 700, levelRequired: 18, category: 'avatar' },
        { name: 'Gold Mic', slug: 'host_gold_mic_cutout', coinCost: 800, levelRequired: 19, category: 'avatar' },
        { name: 'Kawaii Cat Paw', slug: 'kawaii_cat_paw_cutout', coinCost: 400, levelRequired: 20, category: 'avatar' },
        { name: 'RGB Headset', slug: 'gamer_rgb_headset_cutout', coinCost: 500, levelRequired: 21, category: 'avatar' },
        { name: 'Sakura Blossom', slug: 'pink_sakura_blossom_cutout', coinCost: 450, levelRequired: 22, category: 'avatar' },
      ];
      await this.prisma.frame.createMany({
        data: defaultFrames.map((f) => ({
          name: f.name,
          slug: f.slug,
          coinCost: f.coinCost,
          levelRequired: f.levelRequired,
          category: f.category,
          animationKey: f.slug,
          imageUrl: f.slug,
        })),
        skipDuplicates: true,
      });
      all = await this.prisma.frame.findMany({
        where: { isActive: true },
        orderBy: [{ levelRequired: 'asc' }, { id: 'asc' }],
      });
    }

    const unlocked = await this.prisma.userUnlockedFrame.findMany({
      where: { userId },
    });
    const unlockById = new Map(
      unlocked.map((u) => [u.frameId.toString(), u]),
    );

    const masterAssets = [
      'cosmic_galaxy_wings_cutout',
      'royal_gold_crest_gemini_cutout',
      'flame_phoenix_wreath_cutout',
      'golden_twin_dragons_cutout',
      'mythic_griffin_purple_cutout',
      'sapphire_ice_wings_cutout',
      'dragon_slayer_crest_cutout',
      'angel_wings_holy_cutout',
      'fire_dragon_ouroboros_cutout',
      'ice_glacial_dragon_cutout',
      'emerald_jade_dragon_cutout',
      'skull_demon_knight_cutout',
      'peacock_cobra_crest_cutout',
      'peacock_ceo_text_cutout',
      'violet_amethyst_crown_cutout',
      'emerald_royal_laurel_cutout',
      'celestial_saturn_ring_cutout',
      'neon_devil_horns_tail_cutout',
      'host_gold_mic_cutout',
      'kawaii_cat_paw_cutout',
      'gamer_rgb_headset_cutout',
      'pink_sakura_blossom_cutout',
    ];

    const mapFrame = (f: (typeof all)[0], idx: number) => {
      const fallbackAsset = masterAssets[idx % masterAssets.length];
      const assetKey = f.animationKey || f.slug || fallbackAsset;
      const media = presentFrameMedia(f.imageUrl, f.animationUrl, f.compositeMode);
      const displayUrl = media.loop
        ? media.preview_url
        : media.preview_url || assetKey;
      const animationUrl = media.loop ? media.animation_url : displayUrl;
      const row = unlockById.get(f.id.toString());
      const owned = this.frameOwned(row);
      return {
        id: Number(f.id),
        name: f.name,
        slug: f.slug || assetKey,
        category: f.category,
        level_required: f.levelRequired,
        coin_cost: f.coinCost ?? 0,
        price_coins: f.coinCost ?? 0,
        is_premium: f.isPremium,
        image_url: displayUrl,
        animation_key: assetKey,
        animation_url: animationUrl,
        animation_url_lite: media.loop
          ? media.animation_url_lite
          : displayUrl,
        preview_url: media.preview_url || displayUrl,
        media_type: media.media_type,
        loop: media.loop,
        composite: media.composite,
        owned,
        unlocked: owned,
        unlock_type: row?.unlockType ?? null,
        unlocked_at: row?.unlockedAt?.toISOString() ?? null,
        expires_at: owned ? (row?.expiresAt?.toISOString() ?? null) : null,
        duration_days: row?.durationDays ?? null,
        coins_paid: row?.coinsPaid ?? 0,
        is_selected: user.selectedFrameId === f.id,
      };
    };

    return {
      selected_frame: (() => {
        if (!user.selectedFrameId) return null;
        const fIdx = all.findIndex((x) => x.id === user.selectedFrameId);
        return fIdx >= 0 ? mapFrame(all[fIdx], fIdx) : null;
      })(),
      unlocked_frames: all
        .filter((f) => this.frameOwned(unlockById.get(f.id.toString())))
        .map(mapFrame),
      available_frames: all.map(mapFrame),
      frames: all.map(mapFrame),
    };
  }

  async selectFrame(userId: bigint, frameId: bigint) {
    const frame = await this.prisma.frame.findFirst({
      where: { id: frameId, isActive: true },
    });
    if (!frame) {
      throw new NotFoundException({
        success: false,
        error: { code: 'FRAME_NOT_FOUND', message: 'Frame not found' },
      });
    }
    const unlocked = await this.prisma.userUnlockedFrame.findUnique({
      where: { userId_frameId: { userId, frameId } },
    });
    if (!this.frameOwned(unlocked)) {
      throw new BadRequestException({
        success: false,
        error: { code: 'LOCKED', message: 'Frame is locked' },
      });
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { selectedFrameId: frameId },
    });
    return this.frames(userId);
  }

  async purchaseFrame(userId: bigint, frameId: bigint, days?: number) {
    const frame = await this.prisma.frame.findFirst({
      where: { id: frameId, isActive: true },
    });
    if (!frame) {
      throw new NotFoundException({
        success: false,
        error: { code: 'FRAME_NOT_FOUND', message: 'Frame not found' },
      });
    }
    const durationDays =
      days !== undefined && Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 0;
    const permanent = durationDays <= 0;
    const cost = frame.coinCost ?? 0;

    const purchase = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`frame_purchase_${userId}_${frameId}`}))`;
      const already = await tx.userUnlockedFrame.findUnique({
        where: { userId_frameId: { userId, frameId } },
      });
      const stillOwned = this.frameOwned(already);
      if (stillOwned && !already?.expiresAt) {
        return {
          coins_paid: 0,
          already_owned: true,
          expires_at: null as string | null,
          duration_days: already?.durationDays ?? null,
          balances: null as { coins: number; gems?: number } | null,
        };
      }
      const base =
        stillOwned && already?.expiresAt && already.expiresAt.getTime() > Date.now()
          ? already.expiresAt
          : new Date();
      const expiresAt = permanent
        ? null
        : new Date(base.getTime() + durationDays * 86400000);
      const expiryKey = already?.expiresAt?.toISOString() ?? 'none';
      const referenceId = `frame_${userId}_${frameId}_${durationDays}_${expiryKey}`;

      if (cost <= 0) {
        await tx.userUnlockedFrame.upsert({
          where: { userId_frameId: { userId, frameId } },
          create: {
            userId,
            frameId,
            coinsPaid: 0,
            expiresAt,
            durationDays: permanent ? null : durationDays,
            unlockType: 'level',
          },
          update: {
            expiresAt,
            durationDays: permanent ? null : durationDays,
            unlockType: 'level',
          },
        });
        return {
          coins_paid: 0,
          already_owned: false,
          expires_at: expiresAt?.toISOString() ?? null,
          duration_days: permanent ? null : durationDays,
          balances: null,
        };
      }

      const locked = await this.ledger.lockUser(tx, userId);
      try {
        const { after, replayed } = await this.ledger.debitCoins(
          tx,
          userId,
          cost,
          'FRAME',
          `Frame: ${frame.name}`,
          referenceId,
          locked,
          {
            source: 'store',
            currency: 'coins',
            frame_id: Number(frameId),
            days: durationDays,
          },
          'store',
        );
        if (replayed) {
          return {
            coins_paid: 0,
            already_owned: true,
            expires_at: already?.expiresAt?.toISOString() ?? null,
            duration_days: already?.durationDays ?? null,
            balances: { coins: Number(after) },
          };
        }
        await tx.userUnlockedFrame.upsert({
          where: { userId_frameId: { userId, frameId } },
          create: {
            userId,
            frameId,
            coinsPaid: cost,
            expiresAt,
            durationDays: permanent ? null : durationDays,
            unlockType: 'purchase',
          },
          update: {
            coinsPaid: cost,
            expiresAt,
            durationDays: permanent ? null : durationDays,
            unlockType: 'purchase',
          },
        });
        const fresh = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        return {
          coins_paid: cost,
          already_owned: false,
          expires_at: expiresAt?.toISOString() ?? null,
          duration_days: permanent ? null : durationDays,
          balances: { coins: Number(after), gems: Number(fresh.gems) },
        };
      } catch (e) {
        if ((e as { code?: string }).code === 'INSUFFICIENT_BALANCE') {
          throw new BadRequestException({
            success: false,
            error: {
              code: 'INSUFFICIENT_BALANCE',
              message: 'Insufficient coin balance',
            },
          });
        }
        throw e;
      }
    });

    return {
      ...(await this.frames(userId)),
      ...purchase,
      owned: true,
      unlocked: true,
    };
  }

  async entryBars(userId: bigint) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const bars = await this.prisma.entryBar.findMany({
      where: { isActive: true },
      orderBy: [{ levelRequired: 'asc' }, { id: 'asc' }],
    });
    const items = bars.map((b) => ({
      id: Number(b.id),
      name: b.name,
      level_required: b.levelRequired,
      image_url: b.imageUrl,
      unlocked: b.levelRequired <= user.level,
      is_selected: user.selectedEntryBarId === b.id,
    }));
    return {
      items,
      entry_bars: items,
      selected_id: user.selectedEntryBarId
        ? Number(user.selectedEntryBarId)
        : null,
      selected_entry_bar_id: user.selectedEntryBarId
        ? Number(user.selectedEntryBarId)
        : null,
    };
  }

  async selectEntryBar(userId: bigint, entryBarId: bigint) {
    const bar = await this.prisma.entryBar.findFirst({
      where: { id: entryBarId, isActive: true },
    });
    if (!bar) {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Entry bar not found' },
      });
    }
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (bar.levelRequired > user.level) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'LEVEL_REQUIRED',
          message: `Requires level ${bar.levelRequired}`,
        },
      });
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { selectedEntryBarId: entryBarId },
    });
    return this.entryBars(userId);
  }

  async profileDetails(userId: bigint) {
    const level = await this.getLevel(userId);
    const frames = await this.frames(userId);
    return {
      ...level,
      selected_frame: frames.selected_frame,
      unlocked_frames: frames.unlocked_frames,
      available_frames: frames.available_frames,
    };
  }

  async roleFramesCatalog() {
    let roleFrames = await this.prisma.frame.findMany({
      where: { category: 'role', isActive: true },
      orderBy: { id: 'asc' },
    });

    if (roleFrames.length === 0) {
      await this.prisma.frame.createMany({
        data: [
          {
            name: 'Golden Twin Dragons',
            slug: 'golden_twin_dragons',
            category: 'role',
            animationKey: 'agency',
            levelRequired: 1,
            coinCost: 0,
            imageUrl: '/uploads/frames/golden_dragons.png',
          },
          {
            name: 'Sapphire Ice Wings',
            slug: 'sapphire_ice_wings',
            category: 'role',
            animationKey: 'coin_seller',
            levelRequired: 1,
            coinCost: 0,
            imageUrl: '/uploads/frames/ice_wings.png',
          },
          {
            name: 'Emerald Royal Laurel',
            slug: 'emerald_royal_laurel',
            category: 'role',
            animationKey: 'admin',
            levelRequired: 1,
            coinCost: 0,
            imageUrl: '/uploads/frames/royal_laurel.png',
          },
          {
            name: 'Royal Peacock (CEO)',
            slug: 'peacock_ceo_text',
            category: 'role',
            animationKey: 'superadmin',
            levelRequired: 1,
            coinCost: 0,
            imageUrl: '/uploads/frames/royal_peacock.png',
          },
        ],
        skipDuplicates: true,
      });

      roleFrames = await this.prisma.frame.findMany({
        where: { category: 'role', isActive: true },
        orderBy: { id: 'asc' },
      });
    }

    const items = roleFrames.map((f) => {
      const media = presentFrameMedia(f.imageUrl, f.animationUrl, f.compositeMode);
      const preview = media.preview_url || media.image_url;
      const animation = media.animation_url || preview;
      return {
        id: Number(f.id),
        role_key: f.animationKey || 'agency',
        slug: f.slug,
        motion_type: 'hq',
        label: f.name,
        is_default: true,
        animation_url: animation,
        animation_url_lite: media.animation_url_lite || preview,
        preview_url: preview,
        entry_image_url: preview,
        entry_animation_url: animation,
        media_type: media.media_type,
        loop: media.loop,
        composite: media.composite,
      };
    });

    return { role_frames: items };
  }

  async myRoleFrames(userId: bigint) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const catalog = await this.roleFramesCatalog();
    const userRole = user.role.toString().toLowerCase();

    const roleKey =
      userRole === 'agency'
        ? 'agency'
        : userRole === 'seller'
          ? 'coin_seller'
          : userRole === 'admin'
            ? 'admin'
            : null;

    const unlocked = await this.prisma.userUnlockedFrame.findMany({
      where: { userId },
      select: { frameId: true },
    });
    const unlockedIds = new Set(unlocked.map((u) => u.frameId.toString()));

    const eligible = catalog.role_frames.filter((f) => {
      if (roleKey && f.role_key === roleKey) return true;
      if (roleKey === 'admin' && f.role_key === 'superadmin') return true;
      if (unlockedIds.has(String(f.id))) return true;
      return false;
    });

    const selectedId = user.selectedFrameId
      ? Number(user.selectedFrameId)
      : null;
    const selectedFrame = eligible.find((f) => f.id === selectedId) || null;

    const mapped = eligible.map((f) => ({
      ...f,
      owned: true,
      unlocked: true,
      selected: f.id === selectedId,
    }));

    return {
      role_frames: mapped,
      selected_role_frame_id: selectedId,
      role_badge: roleKey
        ? {
            type: roleKey,
            country: user.country,
            label: userRole.toUpperCase(),
            frame: selectedFrame,
          }
        : null,
      role_frame_url: selectedFrame?.animation_url ?? null,
      role_frame_url_lite: selectedFrame?.animation_url_lite ?? null,
      role_frame_url_hq: selectedFrame?.animation_url ?? null,
      role_frame_media_type: selectedFrame?.media_type ?? null,
      role_frame_composite: selectedFrame?.composite ?? null,
    };
  }

  async selectRoleFrame(
    userId: bigint,
    body: { role_frame_id?: number | string },
  ) {
    const frameId = body.role_frame_id ? BigInt(body.role_frame_id) : null;
    if (!frameId) {
      throw new BadRequestException({
        success: false,
        error: { code: 'INVALID_FRAME', message: 'role_frame_id is required' },
      });
    }

    const frame = await this.prisma.frame.findFirst({
      where: { id: frameId, isActive: true },
    });
    if (!frame) {
      throw new NotFoundException({
        success: false,
        error: { code: 'FRAME_NOT_FOUND', message: 'Role frame not found' },
      });
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { selectedFrameId: frameId },
    });

    return this.myRoleFrames(userId);
  }

  async upgradeRoadmap(userId: bigint) {
    await this.ensureDefaultLevels();
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const allLevels = await this.prisma.level.findMany({
      orderBy: { level: 'asc' },
    });

    const userLevel = user.level;
    const userXp = Number(user.xp);
    const currentLevelRow = allLevels.find((l) => l.level === userLevel);
    const minXp = Number(currentLevelRow?.minXp ?? 0);
    const maxXp = Number(currentLevelRow?.maxXp ?? Math.max(userXp, 1));
    const span = Math.max(maxXp - minXp + 1, 1);
    const progressPct = Math.min(
      100,
      Math.max(0, ((userXp - minXp) / span) * 100),
    );

    const milestones = allLevels.slice(0, 30).map((l) => {
      const lMin = Number(l.minXp);
      const lMax = Number(l.maxXp);
      const xpNeeded = Math.max(0, lMin - userXp);
      return {
        level_id: l.level,
        min_xp: lMin,
        max_xp: lMax,
        total_xp_to_reach_level_start: lMin,
        xp_needed_from_current: xpNeeded,
        estimated_coins_needed: xpNeeded,
        is_current: l.level === userLevel,
        is_completed: l.level < userLevel,
        rewards: [
          {
            id: l.level,
            reward_type: 'badge',
            reward_id: l.level,
            reward_title: l.label || `Level ${l.level}`,
            reward_meta: {},
          },
        ],
      };
    });

    const xpSources = [
      {
        id: 1,
        key: 'gifting',
        title: 'Send Gifts',
        description:
          'Earn 1 XP for every coin spent on virtual gifts in party rooms',
        xp_per_unit: 1,
        coin_cost_per_unit: 1,
        is_active: true,
      },
      {
        id: 2,
        key: 'games',
        title: 'Play Casino Games',
        description:
          'Earn XP for every bet placed in Greedy Ferris Wheel and Lucky 77',
        xp_per_unit: 1,
        coin_cost_per_unit: 1,
        is_active: true,
      },
      {
        id: 3,
        key: 'party_room_host',
        title: 'Host Voice Rooms',
        description:
          'Host active party rooms and microphone speaking sessions',
        xp_per_unit: 50,
        coin_cost_per_unit: 0,
        is_active: true,
      },
    ];

    return {
      current: {
        level: userLevel,
        xp: userXp,
        level_min_xp: minXp,
        level_max_xp: maxXp,
        xp_progress_pct: Math.round(progressPct * 10) / 10,
      },
      milestones,
      xp_sources: xpSources,
      economy_meta: {
        coin_to_xp_ratio: 1.0,
        default_coin_estimation_mode: 'linear',
      },
      server_time: new Date().toISOString(),
    };
  }
}

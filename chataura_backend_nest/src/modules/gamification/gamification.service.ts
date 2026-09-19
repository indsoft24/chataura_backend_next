import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LedgerService } from '../wallet/ledger.service';

@Injectable()
export class GamificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  async ensureDefaultLevels() {
    const count = await this.prisma.level.count();
    if (count > 0) return;
    const levels = [];
    for (let i = 1; i <= 50; i++) {
      const minXp = (i - 1) * (i - 1) * 100;
      const maxXp = i * i * 100 - 1;
      levels.push({
        level: i,
        minXp,
        maxXp,
        label: `Level ${i}`,
      });
    }
    await this.prisma.level.createMany({ data: levels });
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
    } | null,
    levelUp = false,
  ) {
    const userXp = Number(user.xp);
    const min = Number(levelRow?.minXp ?? 0);
    const max = Number(levelRow?.maxXp ?? Math.max(userXp, 1));
    const span = Math.max(max - min + 1, 1);
    const pct = Math.min(100, Math.max(0, ((userXp - min) / span) * 100));
    return {
      level: user.level,
      current_level: user.level,
      xp: userXp,
      exp: userXp,
      current_xp: user.xp,
      xp_progress_pct: Math.round(pct * 100) / 100,
      level_min_xp: min,
      level_max_xp: max,
      level_up: levelUp,
      label: levelRow?.label ?? `Level ${user.level}`,
      badge_url: levelRow?.badgeUrl ?? null,
      icon_url: levelRow?.iconUrl ?? null,
    };
  }

  async getLevel(userId: bigint) {
    await this.ensureDefaultLevels();
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const row = await this.prisma.level.findUnique({
      where: { level: user.level },
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
      const newXp = locked.xp + Math.floor(amount);
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
        const freeFrames = await tx.frame.findMany({
          where: {
            isActive: true,
            isPremium: false,
            levelRequired: { lte: newLevel },
            OR: [{ coinCost: null }, { coinCost: 0 }],
          },
        });
        for (const f of freeFrames) {
          await tx.userUnlockedFrame.upsert({
            where: {
              userId_frameId: { userId, frameId: f.id },
            },
            create: { userId, frameId: f.id, coinsPaid: 0 },
            update: {},
          });
        }
      }

      return this.levelPayload(
        { level: newLevel, xp: newXp },
        levelRow,
        levelUp,
      );
    });
  }

  async frames(userId: bigint) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const all = await this.prisma.frame.findMany({
      where: { isActive: true },
      orderBy: [{ levelRequired: 'asc' }, { id: 'asc' }],
    });
    const unlocked = await this.prisma.userUnlockedFrame.findMany({
      where: { userId },
    });
    const unlockedIds = new Set(unlocked.map((u) => u.frameId.toString()));

    const mapFrame = (f: (typeof all)[0]) => ({
      id: Number(f.id),
      name: f.name,
      slug: f.slug,
      category: f.category,
      level_required: f.levelRequired,
      coin_cost: f.coinCost,
      price_coins: f.coinCost,
      is_premium: f.isPremium,
      image_url: f.imageUrl,
      animation_key: f.animationKey,
      unlocked:
        unlockedIds.has(f.id.toString()) || f.levelRequired <= user.level,
      is_selected: user.selectedFrameId === f.id,
    });

    return {
      selected_frame: (() => {
        if (!user.selectedFrameId) return null;
        const f = all.find((x) => x.id === user.selectedFrameId);
        return f ? mapFrame(f) : null;
      })(),
      unlocked_frames: all
        .filter(
          (f) =>
            unlockedIds.has(f.id.toString()) || f.levelRequired <= user.level,
        )
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
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const unlocked = await this.prisma.userUnlockedFrame.findUnique({
      where: { userId_frameId: { userId, frameId } },
    });
    if (!unlocked && frame.levelRequired > user.level) {
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

  async purchaseFrame(userId: bigint, frameId: bigint) {
    const frame = await this.prisma.frame.findFirst({
      where: { id: frameId, isActive: true },
    });
    if (!frame) {
      throw new NotFoundException({
        success: false,
        error: { code: 'FRAME_NOT_FOUND', message: 'Frame not found' },
      });
    }
    const cost = frame.coinCost ?? 0;
    if (cost <= 0) {
      await this.prisma.userUnlockedFrame.upsert({
        where: { userId_frameId: { userId, frameId } },
        create: { userId, frameId, coinsPaid: 0 },
        update: {},
      });
      return { ...(await this.frames(userId)), coins_paid: 0 };
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`frame_purchase_${userId}_${frameId}`}))`;

      const already = await tx.userUnlockedFrame.findUnique({
        where: { userId_frameId: { userId, frameId } },
      });
      if (already) {
        const payload = await this.frames(userId);
        return {
          ...payload,
          coins_paid: 0,
        };
      }

      const locked = await this.ledger.lockUser(tx, userId);
      try {
        const { after } = await this.ledger.debitCoins(
          tx,
          userId,
          cost,
          'FRAME',
          `Frame: ${frame.name}`,
          `frame_${frameId}`,
          locked,
        );
        await tx.userUnlockedFrame.upsert({
          where: { userId_frameId: { userId, frameId } },
          create: { userId, frameId, coinsPaid: cost },
          update: { coinsPaid: cost },
        });
        const payload = await this.frames(userId);
        return {
          ...payload,
          coins_paid: cost,
          balances: { coins: Number(after) },
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

    const items = roleFrames.map((f) => ({
      id: Number(f.id),
      role_key: f.animationKey || 'agency',
      slug: f.slug,
      motion_type: 'hq',
      label: f.name,
      is_default: true,
      animation_url: f.imageUrl,
      animation_url_lite: f.imageUrl,
      preview_url: f.imageUrl,
      entry_image_url: f.imageUrl,
      entry_animation_url: f.imageUrl,
    }));

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

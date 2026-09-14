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

  levelPayload(user: {
    level: number;
    xp: number;
  }, levelRow?: { minXp: number; maxXp: number; label: string | null; badgeUrl: string | null; iconUrl: string | null } | null, levelUp = false) {
    const min = levelRow?.minXp ?? 0;
    const max = levelRow?.maxXp ?? Math.max(user.xp, 1);
    const span = Math.max(max - min + 1, 1);
    const pct = Math.min(100, Math.max(0, ((user.xp - min) / span) * 100));
    return {
      level: user.level,
      current_level: user.level,
      xp: user.xp,
      exp: user.xp,
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
    const levels = await this.prisma.level.findMany({ orderBy: { level: 'asc' } });
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
      unlocked: unlockedIds.has(f.id.toString()) || f.levelRequired <= user.level,
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
      try {
        const { after } = await this.ledger.debitCoins(
          tx,
          userId,
          cost,
          'FRAME',
          `Frame: ${frame.name}`,
          `frame_${frameId}`,
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
}

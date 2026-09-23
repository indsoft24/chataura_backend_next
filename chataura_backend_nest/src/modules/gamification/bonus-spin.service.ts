import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LedgerService, LockedUser } from '../wallet/ledger.service';

function isUniqueViolation(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

const SPIN_PRIZES = [
  {
    label: '100 coins',
    emoji: '💰',
    type: 'coins',
    coins: 100,
    probability: 0.12,
    gift_name: null,
  },
  {
    label: '50 coins',
    emoji: '🪙',
    type: 'coins',
    coins: 50,
    probability: 0.2,
    gift_name: null,
  },
  {
    label: 'Rose',
    emoji: '🌹',
    type: 'gift',
    coins: 10,
    probability: 0.08,
    gift_name: 'Rose',
  },
  {
    label: 'Try again',
    emoji: '💨',
    type: 'loss',
    coins: 0,
    probability: 0.6,
    gift_name: null,
  },
];

export const DEFAULT_BONUS_CONFIG = {
  daily_streak: { enabled: true, rewards: [5, 10, 15, 20, 25, 30, 50] },
  referral_milestone: { enabled: true, required_count: 5, coins: 100 },
  party_room: {
    enabled: false,
    tiers: [] as Array<{ id: number; duration_minutes: number; coins: number }>,
  },
  watch_video: { enabled: false, coins: 0, min_duration_seconds: 0 },
  admob: { enabled: true, coins: 20, daily_limit: 5, cooldown_seconds: 60 },
  game_1: {
    enabled: true,
    coins: 5,
    daily_limit: 10,
    coins_per_fruit: 1,
    coins_on_draw: 0,
    replay_fee_coins: 0,
    free_plays_per_day: 3,
    difficulty: 'medium',
    win_rate_percent: 40,
  },
  game_2: {
    enabled: true,
    coins: 8,
    daily_limit: 10,
    coins_per_fruit: 1,
    coins_on_draw: 0,
    replay_fee_coins: 0,
    free_plays_per_day: 3,
    difficulty: 'medium',
    reward_mode: 'random',
    min_coins: 1,
    max_coins: 8,
    win_rate_percent: 35,
  },
  game_3: {
    enabled: true,
    coins: 6,
    daily_limit: 10,
    coins_per_fruit: 1,
    coins_on_draw: 2,
    replay_fee_coins: 0,
    free_plays_per_day: 3,
    difficulty: 'medium',
    ai_difficulty: 'medium',
    draw_rate_percent: 20,
    win_rate_percent: 30,
  },
};

type GameBonusCfg = (typeof DEFAULT_BONUS_CONFIG)['game_1'];

@Injectable()
export class BonusSpinService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  async prizes() {
    const settings = await this.settings();
    return {
      spin_cost: settings.spinCost,
      prizes: SPIN_PRIZES,
    };
  }

  async play(userId: bigint) {
    const settings = await this.settings();
    const cost = settings.spinCost;
    const prize = this.pickPrize();
    const result = await this.prisma.$transaction(async (tx) => {
      try {
        const { after, locked } = await this.ledger.debitCoins(
          tx,
          userId,
          cost,
          'SPIN',
          'Daily spin',
          `spin_${userId}_${Date.now()}`,
          undefined,
          { source: 'game', currency: 'coins' },
          'game',
        );
        let balance = after;
        if (prize.coins > 0) {
          balance = await this.ledger.creditCoins(
            tx,
            userId,
            prize.coins,
            'SPIN_WIN',
            `Spin win ${prize.label}`,
            `spin_win_${userId}_${Date.now()}`,
            locked,
          );
        }
        return Number(balance);
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
      prize_type: prize.type,
      prize_value: prize.coins,
      gift_name: prize.gift_name,
      new_balance: result,
    };
  }

  async bonusConfig() {
    return this.bonusCfg();
  }

  async bonusStatus(userId: bigint) {
    const cfg = await this.bonusCfg();
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const start = this.startOfUtcDay();
    const [admobToday, lastAdmob, g1, g2, g3] = await Promise.all([
      this.prisma.bonusClaim.count({
        where: { userId, kind: 'admob', createdAt: { gte: start } },
      }),
      this.prisma.bonusClaim.findFirst({
        where: { userId, kind: 'admob' },
        orderBy: { id: 'desc' },
      }),
      this.prisma.bonusClaim.count({
        where: { userId, kind: 'game_1', createdAt: { gte: start } },
      }),
      this.prisma.bonusClaim.count({
        where: { userId, kind: 'game_2', createdAt: { gte: start } },
      }),
      this.prisma.bonusClaim.count({
        where: { userId, kind: 'game_3', createdAt: { gte: start } },
      }),
    ]);
    const cooldown = cfg.admob.cooldown_seconds;
    const sinceAdmob = lastAdmob
      ? Math.floor((Date.now() - lastAdmob.createdAt.getTime()) / 1000)
      : cooldown;
    const secondsUntilNext = Math.max(0, cooldown - sinceAdmob);
    const todayClaimed = this.sameUtcDay(user.lastStreakAt);
    const nextDay = todayClaimed
      ? Math.min(user.streakCount + 1, cfg.daily_streak.rewards.length)
      : Math.min(
          Math.max(user.streakCount, 0) + 1,
          cfg.daily_streak.rewards.length,
        );
    const [invited, milestoneClaim, activeSession, tierClaims] =
      await Promise.all([
        this.prisma.user.count({ where: { invitedBy: userId } }),
        this.prisma.bonusClaim.findFirst({
          where: { userId, referenceKey: 'referral_milestone' },
        }),
        this.prisma.userRoomPresenceSession.findFirst({
          where: { userId, isActive: true },
          orderBy: { joinedAt: 'desc' },
        }),
        this.prisma.bonusClaim.findMany({
          where: { userId, kind: 'party_tier', createdAt: { gte: start } },
        }),
      ]);
    return {
      daily_streak: {
        streak_count: user.streakCount,
        last_check_in_at: user.lastStreakAt?.toISOString() ?? null,
        today_claimed: todayClaimed,
        can_claim_today: cfg.daily_streak.enabled && !todayClaimed,
        next_day_to_claim: todayClaimed
          ? nextDay
          : Math.max(user.streakCount, 0) + 1,
        days: cfg.daily_streak.rewards.map((coins, i) => ({
          day: i + 1,
          coins,
          claimed:
            i < user.streakCount && (todayClaimed || i < user.streakCount),
        })),
      },
      referral_milestone: {
        referral_count: invited,
        required_count: cfg.referral_milestone.required_count,
        claimed: !!milestoneClaim,
        progress_percent: Math.min(
          100,
          Math.floor(
            (invited / Math.max(cfg.referral_milestone.required_count, 1)) *
              100,
          ),
        ),
      },
      party_room: {
        active_room_id: activeSession?.roomId ?? null,
        accumulated_seconds: activeSession?.accumulatedSeconds ?? 0,
        tiers_claimed_today: tierClaims
          .map((c) => {
            const meta = c.meta as { tier_id?: number } | null;
            return meta?.tier_id ?? null;
          })
          .filter((id): id is number => id !== null),
      },
      watch_video: { reels_claimed_today: [] },
      admob: {
        claimed_today: admobToday,
        seconds_until_next_claim: secondsUntilNext,
        can_claim_now:
          cfg.admob.enabled &&
          admobToday < cfg.admob.daily_limit &&
          secondsUntilNext === 0,
      },
      game_1: this.gameStatus(cfg.game_1, g1),
      game_2: this.gameStatus(cfg.game_2, g2),
      game_3: this.gameStatus(cfg.game_3, g3),
    };
  }

  async claimAdmob(userId: bigint) {
    const cfg = await this.bonusCfg();
    if (!cfg.admob.enabled || cfg.admob.coins <= 0) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'DISABLED', message: 'AdMob bonus is disabled' },
      });
    }
    const coins = cfg.admob.coins;
    const day = this.startOfUtcDay().toISOString().slice(0, 10);
    try {
      const after = await this.prisma.$transaction(async (tx) => {
        const start = this.startOfUtcDay();
        const claimedToday = await tx.bonusClaim.count({
          where: { userId, kind: 'admob', createdAt: { gte: start } },
        });
        if (claimedToday >= cfg.admob.daily_limit) {
          throw new ForbiddenException({
            success: false,
            error: { code: 'DAILY_LIMIT', message: 'Daily ad limit reached' },
          });
        }
        const last = await tx.bonusClaim.findFirst({
          where: { userId, kind: 'admob' },
          orderBy: { id: 'desc' },
        });
        if (last) {
          const since = Math.floor(
            (Date.now() - last.createdAt.getTime()) / 1000,
          );
          if (since < cfg.admob.cooldown_seconds) {
            throw new ForbiddenException({
              success: false,
              error: { code: 'COOLDOWN', message: 'AdMob bonus not available yet' },
            });
          }
        }
        const referenceKey = `admob_${day}_${claimedToday + 1}`;
        await tx.bonusClaim.create({
          data: {
            userId,
            kind: 'admob',
            coins,
            referenceKey,
            meta: { source: 'ad', impression_n: claimedToday + 1 },
          },
        });
        return this.ledger.creditCoins(
          tx,
          userId,
          coins,
          'BONUS_ADMOB',
          'Ad reward',
          referenceKey,
          null,
          { source: 'ad', currency: 'coins', impression_n: claimedToday + 1 },
        );
      });
      return {
        bonus: { coins, bonus_type: 'admob' },
        wallet_balance: Number(after),
      };
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ForbiddenException({
          success: false,
          error: { code: 'ALREADY_CLAIMED', message: 'Ad reward already claimed' },
        });
      }
      throw e;
    }
  }

  async claimGame(
    userId: bigint,
    body: {
      game_type: string;
      score?: number;
      result?: string;
      won?: boolean;
      winner?: string;
      accept_fee?: boolean;
    },
  ) {
    const key = this.normalizeGame(body.game_type);
    const cfg = await this.bonusCfg();
    const game = cfg[key];
    if (!game.enabled) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'DISABLED', message: 'Game bonus is disabled' },
      });
    }
    const start = this.startOfUtcDay();
    const claimed = await this.prisma.bonusClaim.count({
      where: { userId, kind: key, createdAt: { gte: start } },
    });
    if (claimed >= game.daily_limit) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'DAILY_LIMIT',
          message: 'Daily game bonus limit reached',
        },
      });
    }
    const freeLeft = Math.max(game.free_plays_per_day - claimed, 0);
    const fee = freeLeft > 0 ? 0 : game.replay_fee_coins;
    if (fee > 0 && !body.accept_fee) {
      throw new BadRequestException({
        success: false,
        error: { code: 'FEE_REQUIRED', message: 'Replay fee required' },
      });
    }
    const resolved = this.resolveGameResult(key, body, game.win_rate_percent);
    let coins = 0;
    if (resolved === 'win') coins = game.coins;
    if (resolved === 'draw') coins = game.coins_on_draw ?? 0;
    const after = await this.prisma.$transaction(async (tx) => {
      let lockedUser: LockedUser | null = null;
      if (fee > 0) {
        try {
          const debited = await this.ledger.debitCoins(
            tx,
            userId,
            fee,
            'BONUS_GAME_FEE',
            `${key} replay fee`,
            `bonus_fee_${key}_${userId}_${Date.now()}`,
          );
          lockedUser = debited.locked;
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
      }
      let balance = 0n;
      const claimedInside = await tx.bonusClaim.count({
        where: { userId, kind: key, createdAt: { gte: start } },
      });
      const referenceKey = `${key}_${userId}_${start.toISOString().slice(0, 10)}_${claimedInside + 1}`;
      if (coins > 0) {
        balance = await this.ledger.creditCoins(
          tx,
          userId,
          coins,
          'BONUS_GAME',
          `${key} bonus`,
          referenceKey,
          lockedUser,
          { source: 'game', currency: 'coins', result: resolved },
        );
      } else {
        if (!lockedUser) {
          lockedUser = await this.ledger.lockUser(tx, userId);
        }
        balance = lockedUser?.wallet_balance ?? 0n;
      }
      await tx.bonusClaim.create({
        data: {
          userId,
          kind: key,
          coins,
          referenceKey,
          meta: { result: resolved, source: 'game' },
        },
      });
      return balance;
    });
    return {
      bonus: { coins, bonus_type: key, resolved_result: resolved },
      wallet_balance: Number(after),
      fee_charged: fee,
    };
  }

  async claimStreak(userId: bigint) {
    const cfg = await this.bonusCfg();
    if (!cfg.daily_streak.enabled) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'DISABLED', message: 'Streak bonus is disabled' },
      });
    }
    const dayKey = this.startOfUtcDay().toISOString().slice(0, 10);
    const referenceKey = `streak_${dayKey}`;
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const locked = await this.ledger.lockUser(tx, userId);
        if (!locked) throw new ForbiddenException('User not found');
        const last = locked.last_streak_at
          ? new Date(locked.last_streak_at)
          : null;
        if (this.sameUtcDay(last)) {
          throw new ForbiddenException({
            success: false,
            error: {
              code: 'ALREADY_CLAIMED',
              message: 'Streak already claimed today',
            },
          });
        }
        const yesterday = this.sameUtcDay(
          last,
          new Date(Date.now() - 86400000),
        );
        const nextCount = yesterday ? Number(locked.streak_count) + 1 : 1;
        const idx = Math.min(nextCount, cfg.daily_streak.rewards.length) - 1;
        const coins = cfg.daily_streak.rewards[Math.max(idx, 0)] ?? 0;
        await tx.bonusClaim.create({
          data: {
            userId,
            kind: 'streak',
            coins,
            referenceKey,
            meta: { day: nextCount, source: 'rewards' },
          },
        });
        const credited =
          coins > 0
            ? await this.ledger.creditCoins(
                tx,
                userId,
                coins,
                'BONUS_STREAK',
                `Streak day ${nextCount}`,
                referenceKey,
                locked,
                {
                  source: 'rewards',
                  currency: 'coins',
                  check_in_day: nextCount,
                },
              )
            : BigInt(locked.wallet_balance);
        await tx.user.update({
          where: { id: userId },
          data: { streakCount: nextCount, lastStreakAt: new Date() },
        });
        return { coins, nextCount, credited };
      });
      return {
        bonus: {
          coins: result.coins,
          bonus_type: 'streak',
          streak_count: result.nextCount,
        },
        wallet_balance: Number(result.credited),
      };
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ForbiddenException({
          success: false,
          error: {
            code: 'ALREADY_CLAIMED',
            message: 'Streak already claimed today',
          },
        });
      }
      throw e;
    }
  }

  private pickPrize() {
    let roll = Math.random();
    for (const p of SPIN_PRIZES) {
      roll -= p.probability;
      if (roll <= 0) return p;
    }
    return SPIN_PRIZES[SPIN_PRIZES.length - 1];
  }

  private normalizeGame(raw: string): 'game_1' | 'game_2' | 'game_3' {
    const t = raw.replace('-', '_');
    if (t === 'game_2' || t === '2') return 'game_2';
    if (t === 'game_3' || t === '3') return 'game_3';
    return 'game_1';
  }

  private resolveGameResult(
    key: 'game_1' | 'game_2' | 'game_3',
    body: { result?: string; won?: boolean; winner?: string },
    winRate: number,
  ) {
    if (key === 'game_3') {
      if (body.result === 'draw' || body.winner === 'draw') return 'draw';
      if (body.result === 'loss' || body.winner === 'ai') return 'loss';
      if (
        body.result === 'win' ||
        body.won === true ||
        body.winner === 'player'
      ) {
        return 'win';
      }
    }
    if (body.won === true || body.result === 'win') return 'win';
    if (Math.random() * 100 < winRate) return 'win';
    return key === 'game_1' ? 'miss' : 'lose';
  }

  private gameStatus(game: GameBonusCfg, claimedToday: number) {
    const freeLeft = Math.max(game.free_plays_per_day - claimedToday, 0);
    const fee = freeLeft > 0 ? 0 : game.replay_fee_coins;
    return {
      claimed_today: claimedToday,
      next_play_fee_coins: fee,
      is_next_play_free: fee === 0 && claimedToday < game.daily_limit,
      plays_remaining_today: Math.max(game.daily_limit - claimedToday, 0),
      replay_fee_coins: game.replay_fee_coins,
      free_plays_per_day: game.free_plays_per_day,
    };
  }

  private async bonusCfg() {
    const settings = await this.settings();
    const extra = (settings.bonusConfig ?? {}) as Record<string, unknown>;
    const merged = {
      ...DEFAULT_BONUS_CONFIG,
      ...extra,
      daily_streak: {
        ...DEFAULT_BONUS_CONFIG.daily_streak,
        ...((extra.daily_streak as object) ?? {}),
      },
      admob: {
        ...DEFAULT_BONUS_CONFIG.admob,
        ...((extra.admob as object) ?? {}),
      },
      referral_milestone: {
        ...DEFAULT_BONUS_CONFIG.referral_milestone,
        ...((extra.referral_milestone as object) ?? {}),
      },
    };
    const tiers = await this.prisma.partyRoomBonusTier.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { durationMinutes: 'asc' }],
    });
    merged.party_room = {
      enabled: tiers.length > 0,
      tiers: tiers.map((t) => ({
        id: Number(t.id),
        duration_minutes: t.durationMinutes,
        reward_type: t.rewardType,
        coins: t.rewardType === 'gems' ? 0 : t.coins,
        gems: t.rewardType === 'gems' ? t.gems : 0,
      })),
    };
    return merged;
  }

  private async settings() {
    let row = await this.prisma.adminSetting.findUnique({ where: { id: 1 } });
    if (!row) row = await this.prisma.adminSetting.create({ data: { id: 1 } });
    return row;
  }

  private startOfUtcDay(d = new Date()) {
    return new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
    );
  }

  private sameUtcDay(value?: Date | null, vs = new Date()) {
    if (!value) return false;
    return (
      this.startOfUtcDay(value).getTime() === this.startOfUtcDay(vs).getTime()
    );
  }
}

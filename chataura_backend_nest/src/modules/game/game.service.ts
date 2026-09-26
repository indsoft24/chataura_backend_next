import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LedgerService } from '../wallet/ledger.service';
import { GameEvents } from './game.events';
import {
  BETTING_SECONDS,
  GREEDY_FEAST,
  GREEDY_ITEMS,
  GREEDY_MAX,
  GREEDY_MIN,
  GREEDY_SALAD,
  LUCKY77_MAX,
  LUCKY77_MIN,
  LUCKY77_OPTIONS,
  pickWeighted,
  secondsRemaining,
} from './game.constants';

const STAFF_ROLES = new Set([
  'admin',
  'superadmin',
  'ceo',
  'manager',
  'staff',
  'agency',
]);

const STAFF_BADGE_TYPES = new Set([
  'admin',
  'superadmin',
  'ceo',
  'manager',
  'agency',
]);

type PlayEligibilityUser = {
  role: UserRole | string;
  staffBadgeType?: string | null;
};

@Injectable()
export class GameService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly events: GameEvents,
  ) {}

  /**
   * Coin sellers only are blocked from games.
   * Staff (admin/manager/ceo/superadmin) and agency are always allowed.
   */
  isCoinSeller(user: PlayEligibilityUser): boolean {
    const role = String(user.role ?? '')
      .toLowerCase()
      .trim();
    const badge = String(user.staffBadgeType ?? '')
      .toLowerCase()
      .trim();

    if (STAFF_BADGE_TYPES.has(badge)) return false;
    if (STAFF_ROLES.has(role)) return false;
    if (role === 'seller' || badge === 'coin_seller') return true;
    return false;
  }

  assertCanPlay(user: PlayEligibilityUser | UserRole | string) {
    const normalized: PlayEligibilityUser =
      typeof user === 'string' ? { role: user } : user;

    if (!this.isCoinSeller(normalized)) return;

    throw new ForbiddenException({
      success: false,
      error: {
        code: 'COIN_SELLER_GAMES_FORBIDDEN',
        message: 'Coin seller accounts cannot play games.',
      },
    });
  }

  async greedyState(userId: bigint) {
    await this.ensureGreedyRound();
    await this.settleGreedyIfDue();
    const round = await this.currentGreedy();
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const bets = await this.prisma.greedyBet.findMany({
      where: { roundId: round.id, userId },
    });
    const userBets: Record<string, number> = {};
    for (const b of bets) {
      userBets[b.item] = (userBets[b.item] ?? 0) + Number(b.chipAmount);
    }
    const pool = await this.prisma.greedyBet.aggregate({
      where: { roundId: round.id },
      _sum: { chipAmount: true },
    });
    const remaining = secondsRemaining(round.bettingEndsAt);
    const phase =
      remaining <= 0 && round.phase === 'betting' ? 'drawing' : round.phase;
    return {
      round_id: Number(round.id),
      phase,
      seconds_remaining: remaining,
      user_balance: Number(user.walletBalance),
      user_bets: userBets,
      total_bets_pool: Number(pool._sum.chipAmount ?? 0n),
      recent_history: await this.greedyHistory(15),
      today_winners: await this.greedyLeaderboard(5),
    };
  }

  async greedyBet(userId: bigint, item: string, amount: number) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    this.assertCanPlay(user);
    if (!GREEDY_ITEMS[item]) {
      throw new BadRequestException({
        success: false,
        error: { code: 'INVALID_ITEM', message: 'Invalid item' },
      });
    }
    if (amount < GREEDY_MIN || amount > GREEDY_MAX) {
      throw new BadRequestException({
        success: false,
        error: { code: 'INVALID_AMOUNT', message: 'Invalid bet amount' },
      });
    }
    await this.ensureGreedyRound();
    const round = await this.currentGreedy();
    const remaining = secondsRemaining(round.bettingEndsAt);
    if (remaining <= 1 || round.phase !== 'betting') {
      throw new BadRequestException({
        success: false,
        error: { code: 'BETTING_CLOSED', message: 'Betting is closed' },
      });
    }
    const spec = GREEDY_ITEMS[item];
    const placed = await this.prisma.$transaction(async (tx) => {
      try {
        const { after } = await this.ledger.debitCoins(
          tx,
          userId,
          amount,
          'GAME_GREEDY',
          `Greedy bet ${item}`,
          `greedy_${round.id}_${item}_${Date.now()}`,
          undefined,
          { source: 'game', currency: 'coins', round_id: round.id.toString(), item },
        );
        await tx.greedyBet.create({
          data: {
            roundId: round.id,
            userId,
            item,
            chipAmount: BigInt(amount),
            multiplier: spec.multiplier,
            potentialPayout: BigInt(amount * spec.multiplier),
          },
        });
        return after;
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
    const bets = await this.prisma.greedyBet.findMany({
      where: { roundId: round.id, userId, item },
    });
    const totalOnItem = bets.reduce((s, b) => s + Number(b.chipAmount), 0);
    return {
      item,
      placed_amount: amount,
      total_on_item: totalOnItem,
      remaining_balance: Number(placed),
      round_id: Number(round.id),
    };
  }

  async greedyQuickBet(userId: bigint, type: string, chipAmount: number) {
    const kind = type === 'veggie' || type === 'salad' ? 'salad' : 'feast';
    const items = kind === 'salad' ? GREEDY_SALAD : GREEDY_FEAST;
    const updated: Record<string, number> = {};
    let lastBalance = 0;
    for (const item of items) {
      const res = await this.greedyBet(userId, item, chipAmount);
      updated[item] = res.total_on_item;
      lastBalance = res.remaining_balance;
    }
    return {
      type: kind,
      items,
      total_cost: chipAmount * items.length,
      updated_bets: updated,
      remaining_balance: lastBalance,
      round_id: Number((await this.currentGreedy()).id),
    };
  }

  async greedyResult(userId: bigint, roundId: bigint) {
    await this.settleGreedyIfDue(roundId);
    const round = await this.prisma.greedyRound.findUnique({
      where: { id: roundId },
    });
    if (!round) {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Round not found' },
      });
    }
    if (round.phase !== 'completed') {
      return this.greedyState(userId);
    }
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const bets = await this.prisma.greedyBet.findMany({
      where: { roundId, userId },
    });
    const userBets: Record<string, number> = {};
    let payout = 0;
    for (const b of bets) {
      userBets[b.item] = (userBets[b.item] ?? 0) + Number(b.chipAmount);
      payout += Number(b.actualPayout);
    }
    const next = await this.currentGreedy();
    return {
      round_id: Number(round.id),
      winning_item: round.winningItem,
      winning_multiplier: round.winningMultiplier,
      user_payout: payout,
      user_balance: Number(user.walletBalance),
      user_bets: userBets,
      phase: 'completed',
      seconds_remaining: secondsRemaining(next.bettingEndsAt),
      next_round_id: Number(next.id),
      recent_history: await this.greedyHistory(15),
      today_winners: await this.greedyLeaderboard(5),
    };
  }

  async greedyHistory(take = 30) {
    const rows = await this.prisma.greedyRound.findMany({
      where: { phase: 'completed' },
      orderBy: { id: 'desc' },
      take,
    });
    return rows.map((r) => ({
      round_id: Number(r.id),
      winning_item: r.winningItem,
      multiplier: r.winningMultiplier,
      settled_at: r.settledAt?.toISOString() ?? null,
    }));
  }

  async greedyLeaderboard(take = 20) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const limit = Math.max(1, Math.min(take, 100));

    const rows = await this.prisma.$queryRaw<
      Array<{
        user_id: bigint;
        name: string | null;
        avatar_url: string | null;
        total_won: bigint;
      }>
    >`
      SELECT 
        b.user_id,
        COALESCE(u.display_name, u.name) AS name,
        u.avatar_url,
        SUM(b.actual_payout)::bigint AS total_won
      FROM greedy_bets b
      JOIN users u ON u.id = b.user_id
      WHERE b.status = 'won'
        AND b.created_at >= ${start}
      GROUP BY b.user_id, u.display_name, u.name, u.avatar_url
      ORDER BY total_won DESC
      LIMIT ${limit}
    `;

    return rows.map((row, i) => ({
      rank: i + 1,
      user_id: Number(row.user_id),
      name: row.name,
      avatar_url: row.avatar_url,
      total_won: Number(row.total_won),
    }));
  }

  async luckyState(userId: bigint) {
    await this.ensureLuckyRound();
    await this.settleLuckyIfDue();
    const round = await this.currentLucky();
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const bets = await this.prisma.lucky77Bet.findMany({
      where: { roundId: round.id, userId },
    });
    const poolsRaw = await this.prisma.lucky77Bet.groupBy({
      by: ['option'],
      where: { roundId: round.id },
      _sum: { chipAmount: true },
    });
    const pools = { watermelon: 0, lucky_77: 0, plum: 0 };
    for (const p of poolsRaw) {
      pools[p.option as keyof typeof pools] = Number(p._sum.chipAmount ?? 0n);
    }
    const chosen = bets[0]?.option ?? null;
    const remaining = secondsRemaining(round.bettingEndsAt);
    const phase =
      remaining <= 0 && round.phase === 'betting' ? 'drawing' : round.phase;
    return {
      round_id: Number(round.id),
      phase,
      seconds_remaining: remaining,
      user_balance: Number(user.walletBalance),
      user_chosen_option: chosen,
      user_bet_amount: bets.reduce((s, b) => s + Number(b.chipAmount), 0),
      pools,
    };
  }

  async luckyBet(userId: bigint, option: string, amount: number) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    this.assertCanPlay(user);
    if (!LUCKY77_OPTIONS[option]) {
      throw new BadRequestException({
        success: false,
        error: { code: 'INVALID_OPTION', message: 'Invalid option' },
      });
    }
    if (amount < LUCKY77_MIN || amount > LUCKY77_MAX) {
      throw new BadRequestException({
        success: false,
        error: { code: 'INVALID_AMOUNT', message: 'Invalid bet amount' },
      });
    }
    await this.ensureLuckyRound();
    const round = await this.currentLucky();
    if (
      secondsRemaining(round.bettingEndsAt) <= 1 ||
      round.phase !== 'betting'
    ) {
      throw new BadRequestException({
        success: false,
        error: { code: 'BETTING_CLOSED', message: 'Betting is closed' },
      });
    }
    const existing = await this.prisma.lucky77Bet.findMany({
      where: { roundId: round.id, userId },
    });
    const options = new Set(existing.map((e) => e.option));
    if (!options.has(option) && options.size >= 2) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'MAX_OPTIONS',
          message: 'Maximum 2 options per round',
        },
      });
    }
    const spec = LUCKY77_OPTIONS[option];
    const after = await this.prisma.$transaction(async (tx) => {
      try {
        const { after } = await this.ledger.debitCoins(
          tx,
          userId,
          amount,
          'GAME_LUCKY77',
          `Lucky77 ${option}`,
          `lucky77_${round.id}_${option}_${Date.now()}`,
          undefined,
          { source: 'game', currency: 'coins', round_id: round.id.toString(), option },
        );
        await tx.lucky77Bet.create({
          data: {
            roundId: round.id,
            userId,
            option,
            chipAmount: BigInt(amount),
            multiplier: spec.multiplier,
            potentialPayout: BigInt(amount * spec.multiplier),
          },
        });
        return after;
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
    const all = await this.prisma.lucky77Bet.findMany({
      where: { roundId: round.id, userId, option },
    });
    return {
      option,
      placed_amount: amount,
      total_on_option: all.reduce((s, b) => s + Number(b.chipAmount), 0),
      remaining_balance: Number(after),
      round_id: Number(round.id),
    };
  }

  async luckyResult(userId: bigint, roundId: bigint) {
    await this.settleLuckyIfDue(roundId);
    const round = await this.prisma.lucky77Round.findUnique({
      where: { id: roundId },
    });
    if (!round) {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Round not found' },
      });
    }
    if (round.phase !== 'completed') return this.luckyState(userId);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const bets = await this.prisma.lucky77Bet.findMany({
      where: { roundId, userId },
    });
    const next = await this.currentLucky();
    return {
      round_id: Number(round.id),
      winning_item: round.winningItem,
      winning_multiplier: round.winningMultiplier,
      user_payout: bets.reduce((s, b) => s + Number(b.actualPayout), 0),
      user_balance: Number(user.walletBalance),
      user_chosen_option: bets[0]?.option ?? null,
      user_bet_amount: bets.reduce((s, b) => s + Number(b.chipAmount), 0),
      phase: 'completed',
      seconds_remaining: secondsRemaining(next.bettingEndsAt),
      next_round_id: Number(next.id),
    };
  }

  async ensureGreedyRound() {
    const open = await this.prisma.greedyRound.findFirst({
      where: { phase: { in: ['betting', 'drawing'] } },
      orderBy: { id: 'desc' },
    });
    if (open) return open;

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('greedy_round_create'))`;
      const checkAgain = await tx.greedyRound.findFirst({
        where: { phase: { in: ['betting', 'drawing'] } },
        orderBy: { id: 'desc' },
      });
      if (checkAgain) return checkAgain;
      return tx.greedyRound.create({
        data: {
          phase: 'betting',
          bettingEndsAt: new Date(Date.now() + BETTING_SECONDS * 1000),
        },
      });
    });
  }

  async ensureLuckyRound() {
    const open = await this.prisma.lucky77Round.findFirst({
      where: { phase: { in: ['betting', 'drawing'] } },
      orderBy: { id: 'desc' },
    });
    if (open) return open;

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('lucky77_round_create'))`;
      const checkAgain = await tx.lucky77Round.findFirst({
        where: { phase: { in: ['betting', 'drawing'] } },
        orderBy: { id: 'desc' },
      });
      if (checkAgain) return checkAgain;
      return tx.lucky77Round.create({
        data: {
          phase: 'betting',
          bettingEndsAt: new Date(Date.now() + BETTING_SECONDS * 1000),
        },
      });
    });
  }

  async currentGreedy() {
    return await this.ensureGreedyRound();
  }

  async currentLucky() {
    return await this.ensureLuckyRound();
  }

  async settleGreedyIfDue(roundId?: bigint) {
    const now = new Date();
    const settled = await this.prisma.$transaction(async (tx) => {
      let rows: Array<{ id: bigint; phase: string; betting_ends_at: Date }>;
      if (roundId) {
        rows = await tx.$queryRaw<
          Array<{ id: bigint; phase: string; betting_ends_at: Date }>
        >`SELECT id, phase, betting_ends_at FROM greedy_rounds WHERE id = ${roundId} AND phase != 'completed' FOR UPDATE SKIP LOCKED`;
      } else {
        rows = await tx.$queryRaw<
          Array<{ id: bigint; phase: string; betting_ends_at: Date }>
        >`SELECT id, phase, betting_ends_at FROM greedy_rounds WHERE phase != 'completed' AND betting_ends_at <= ${now} ORDER BY id ASC LIMIT 1 FOR UPDATE SKIP LOCKED`;
      }
      const current = rows[0];
      if (
        !current ||
        current.phase === 'completed' ||
        new Date(current.betting_ends_at).getTime() > Date.now()
      ) {
        return null;
      }

      // Winner rolled within single-claimer lock
      const winner = pickWeighted(GREEDY_ITEMS);
      const mult = GREEDY_ITEMS[winner].multiplier;

      await tx.greedyRound.update({
        where: { id: current.id },
        data: {
          phase: 'completed',
          winningItem: winner,
          winningMultiplier: mult,
          settledAt: new Date(),
        },
      });

      const bets = await tx.greedyBet.findMany({
        where: { roundId: current.id },
      });
      const byUser = new Map<string, typeof bets>();
      for (const b of bets) {
        const k = b.userId.toString();
        byUser.set(k, [...(byUser.get(k) ?? []), b]);
      }
      for (const [, userBets] of byUser) {
        let payout = 0n;
        for (const b of userBets) {
          const won = b.item === winner;
          const actual = won ? b.chipAmount * BigInt(mult) : 0n;
          payout += actual;
          await tx.greedyBet.update({
            where: { id: b.id },
            data: {
              status: won ? 'won' : 'lost',
              actualPayout: actual,
            },
          });
        }
        if (payout > 0n) {
          const winRef = `greedy_win_${current.id}`;
          const alreadyPaid = await tx.coinTransaction.findFirst({
            where: {
              userId: userBets[0].userId,
              referenceId: winRef,
            },
          });
          if (!alreadyPaid) {
            await this.ledger.creditCoins(
              tx,
              userBets[0].userId,
              payout,
              'GAME_GREEDY_WIN',
              `Greedy win ${winner}`,
              winRef,
              null,
              { source: 'game', currency: 'coins', round_id: current.id.toString() },
            );
          }
        }
      }

      return {
        roundId: current.id,
        winner,
        mult,
      };
    });

    if (!settled) return;

    await this.ensureGreedyRound();
    this.events.emitResult('greedy', {
      roundId: Number(settled.roundId),
      winningItem: settled.winner,
      multiplier: settled.mult,
    });
  }

  async settleLuckyIfDue(roundId?: bigint) {
    const now = new Date();
    const settled = await this.prisma.$transaction(async (tx) => {
      let rows: Array<{ id: bigint; phase: string; betting_ends_at: Date }>;
      if (roundId) {
        rows = await tx.$queryRaw<
          Array<{ id: bigint; phase: string; betting_ends_at: Date }>
        >`SELECT id, phase, betting_ends_at FROM lucky77_rounds WHERE id = ${roundId} AND phase != 'completed' FOR UPDATE SKIP LOCKED`;
      } else {
        rows = await tx.$queryRaw<
          Array<{ id: bigint; phase: string; betting_ends_at: Date }>
        >`SELECT id, phase, betting_ends_at FROM lucky77_rounds WHERE phase != 'completed' AND betting_ends_at <= ${now} ORDER BY id ASC LIMIT 1 FOR UPDATE SKIP LOCKED`;
      }
      const current = rows[0];
      if (
        !current ||
        current.phase === 'completed' ||
        new Date(current.betting_ends_at).getTime() > Date.now()
      ) {
        return null;
      }

      const winner = pickWeighted(LUCKY77_OPTIONS);
      const mult = LUCKY77_OPTIONS[winner].multiplier;

      await tx.lucky77Round.update({
        where: { id: current.id },
        data: {
          phase: 'completed',
          winningItem: winner,
          winningMultiplier: mult,
          settledAt: new Date(),
        },
      });

      const bets = await tx.lucky77Bet.findMany({
        where: { roundId: current.id },
      });
      const byUser = new Map<string, typeof bets>();
      for (const b of bets) {
        const k = b.userId.toString();
        byUser.set(k, [...(byUser.get(k) ?? []), b]);
      }
      for (const [, userBets] of byUser) {
        let payout = 0n;
        for (const b of userBets) {
          const won = b.option === winner;
          const actual = won ? b.chipAmount * BigInt(mult) : 0n;
          payout += actual;
          await tx.lucky77Bet.update({
            where: { id: b.id },
            data: { status: won ? 'won' : 'lost', actualPayout: actual },
          });
        }
        if (payout > 0n) {
          const winRef = `lucky77_win_${current.id}`;
          const alreadyPaid = await tx.coinTransaction.findFirst({
            where: {
              userId: userBets[0].userId,
              referenceId: winRef,
            },
          });
          if (!alreadyPaid) {
            await this.ledger.creditCoins(
              tx,
              userBets[0].userId,
              payout,
              'GAME_LUCKY77_WIN',
              `Lucky77 win ${winner}`,
              winRef,
              null,
              { source: 'game', currency: 'coins', round_id: current.id.toString() },
            );
          }
        }
      }

      return {
        roundId: current.id,
        winner,
        mult,
      };
    });

    if (!settled) return;

    await this.ensureLuckyRound();
    this.events.emitResult('lucky77', {
      roundId: Number(settled.roundId),
      winningItem: settled.winner,
      multiplier: settled.mult,
    });
  }

  async tick() {
    const g = await this.ensureGreedyRound();
    const l = await this.ensureLuckyRound();
    this.events.emitTick('greedy', {
      roundId: Number(g.id),
      secondsRemaining: secondsRemaining(g.bettingEndsAt),
    });
    this.events.emitTick('lucky77', {
      roundId: Number(l.id),
      secondsRemaining: secondsRemaining(l.bettingEndsAt),
    });
    await this.settleGreedyIfDue();
    await this.settleLuckyIfDue();
  }
}

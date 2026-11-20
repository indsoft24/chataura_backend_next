import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GameService } from '../game/game.service';
import { GameHistoryService } from '../game-history/game-history.service';
import { LedgerService } from '../wallet/ledger.service';
import {
  LF_BETTING_SECONDS,
  LF_BONUS_COUNT,
  LF_CHEST_TARGETS,
  LF_CHIPS,
  LF_CLOSE_GUARD_MS,
  LF_FRUITS,
  LF_ITEMS,
  LF_KEYS,
  LF_RESULT_SECONDS,
  LuckyFruitSettings,
  betPayout,
  drawBonusFruits,
  drawWinner,
  istDay,
  istMidnight,
  readSettings,
  rtpByFruit,
  settingsForApi,
  validChestRewards,
  validWeights,
} from './lucky-fruit.rules';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Tx = Prisma.TransactionClient;

function fail(code: string, message: string): never {
  throw new BadRequestException({ success: false, error: { code, message } });
}
const secs = (ms: number) => Math.max(0, Math.ceil(ms / 1000));

@Injectable()
export class LuckyFruitService {
  private readonly logger = new Logger(LuckyFruitService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly history: GameHistoryService,
    private readonly games: GameService,
  ) {}

  // ---------- settings ----------
  async settings(): Promise<LuckyFruitSettings> {
    const row = await this.prisma.adminSetting.findUnique({ where: { id: 1 }, select: { extraSettings: true } });
    return readSettings(row?.extraSettings as Record<string, unknown> | null);
  }

  async adminView() {
    const s = await this.settings();
    return { ...settingsForApi(s), rtp: rtpByFruit(s), multipliers: Object.fromEntries(Object.entries(LF_ITEMS).map(([k, v]) => [k, v.multiplier])) };
  }

  async updateSettings(patch: Record<string, unknown>, actorId: bigint) {
    if (patch[LF_KEYS.weights] !== undefined && !validWeights(patch[LF_KEYS.weights]))
      fail('BAD_SETTINGS', 'Weights: all 10 tiles, whole numbers 1 to 10,000,000');
    const pct = patch[LF_KEYS.bonusPct];
    if (pct !== undefined && !(Number.isInteger(pct) && (pct as number) >= 0 && (pct as number) <= 100))
      fail('BAD_SETTINGS', 'Bonus pay must be 0 to 100');
    const max = patch[LF_KEYS.maxRoundBet];
    if (max !== undefined && !(Number.isSafeInteger(max) && (max as number) >= 1000 && (max as number) <= 1_000_000_000))
      fail('BAD_SETTINGS', 'Max bet per round must be 1,000 to 1,000,000,000');
    if (patch[LF_KEYS.chestRewards] !== undefined && !validChestRewards(patch[LF_KEYS.chestRewards]))
      fail('BAD_SETTINGS', 'Chest rewards: 5 whole numbers, 0 to 1,000,000,000');
    if (patch[LF_KEYS.enabled] !== undefined && typeof patch[LF_KEYS.enabled] !== 'boolean') fail('BAD_SETTINGS', 'Enabled must be true or false');
    const next = { ...settingsForApi(await this.settings()) } as Record<string, unknown>;
    for (const k of Object.values(LF_KEYS)) if (patch[k] !== undefined) next[k] = patch[k];
    const s = readSettings(next);
    const current = await this.prisma.adminSetting.findUnique({ where: { id: 1 } });
    const extra = { ...((current?.extraSettings as Record<string, unknown>) ?? {}), ...settingsForApi(s) };
    await this.prisma.adminSetting.upsert({
      where: { id: 1 },
      create: { id: 1, extraSettings: extra as Prisma.InputJsonValue },
      update: { extraSettings: extra as Prisma.InputJsonValue },
    });
    this.logger.log(`Lucky Fruit settings changed by admin ${actorId}: ${JSON.stringify(settingsForApi(s))}`);
    return this.adminView();
  }

  async adminStats() {
    const rows = await this.prisma.$queryRaw<
      Array<{ d: string; bets: bigint; payout: bigint; players: bigint; rounds: bigint }>
    >`SELECT to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS d, SUM(amount)::bigint AS bets,
        SUM(payout)::bigint AS payout, COUNT(DISTINCT user_id)::bigint AS players, COUNT(DISTINCT round_id)::bigint AS rounds
      FROM lucky_fruit_bets WHERE created_at >= now() - interval '7 days' AND status <> 'placed'
      GROUP BY 1 ORDER BY 1 DESC`;
    return {
      days: rows.map((r) => ({
        day: r.d,
        bets: Number(r.bets),
        payout: Number(r.payout),
        players: Number(r.players),
        rounds: Number(r.rounds),
        rtp: r.bets > 0n ? Math.round((Number(r.payout) / Number(r.bets)) * 10_000) / 100 : 0,
      })),
    };
  }

  // ---------- rounds ----------
  /** The one open (not yet settled) round; created here if there is none (first use, or after downtime). */
  async ensureRound(): Promise<{ id: bigint; opensAt: Date; closesAt: Date }> {
    const find = (db: Tx | PrismaService) =>
      db.luckyFruitRound.findFirst({ where: { phase: 'betting' }, orderBy: { id: 'desc' } });
    const open = await find(this.prisma);
    if (open) return open;
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('lucky_fruit_round_create'))`;
      return (
        (await find(tx)) ??
        tx.luckyFruitRound.create({
          data: { opensAt: new Date(), closesAt: new Date(Date.now() + LF_BETTING_SECONDS * 1000) },
        })
      );
    });
  }

  /** Draw + pay the due round (if any) and open the next one. Safe to call from every instance every second. */
  async settleIfDue(roundId?: bigint): Promise<boolean> {
    // Cheap read first: most calls find nothing due, so skip opening a transaction (pool is small).
    const due = await this.prisma.luckyFruitRound.findFirst({
      where: { phase: 'betting', closesAt: { lte: new Date() }, ...(roundId ? { id: roundId } : {}) },
      select: { id: true },
    });
    if (!due) return false;
    const done = await this.prisma.$transaction(
      async (tx) => {
        const rows = roundId
          ? await tx.$queryRaw<Array<{ id: bigint }>>`SELECT id FROM lucky_fruit_rounds WHERE id = ${roundId} AND phase = 'betting' AND closes_at <= now() FOR UPDATE SKIP LOCKED`
          : await tx.$queryRaw<Array<{ id: bigint }>>`SELECT id FROM lucky_fruit_rounds WHERE phase = 'betting' AND closes_at <= now() ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`;
        const id = rows[0]?.id;
        if (id === undefined) return false;
        const s = readSettings(
          (await tx.adminSetting.findUnique({ where: { id: 1 }, select: { extraSettings: true } }))?.extraSettings as Record<string, unknown> | null,
        );
        const winner = drawWinner(s.weights);
        const bonus = LF_BONUS_COUNT[winner] ? drawBonusFruits(LF_BONUS_COUNT[winner]) : [];
        const now = new Date();
        await tx.luckyFruitRound.update({
          where: { id },
          data: { phase: 'completed', winningItem: winner, bonusItems: bonus, settledAt: now },
        });
        const bets = await tx.luckyFruitBet.findMany({ where: { roundId: id }, orderBy: { id: 'asc' } });
        const perUser = new Map<bigint, { bet: bigint; payout: bigint }>();
        for (const b of bets) {
          const payout = betPayout(b.item, b.amount, winner, bonus, s.bonusPct);
          await tx.luckyFruitBet.update({ where: { id: b.id }, data: { payout, status: payout > 0n ? 'won' : 'lost' } });
          const u = perUser.get(b.userId) ?? { bet: 0n, payout: 0n };
          u.bet += b.amount;
          u.payout += payout;
          perUser.set(b.userId, u);
        }
        for (const [userId, t] of perUser) {
          if (t.payout > 0n)
            await this.ledger.creditCoins(tx, userId, t.payout, 'GAME_LUCKY_FRUIT_WIN', `Lucky Fruit win ${winner}`, `lucky_fruit:win:${id}`, null, {
              source: 'game',
              currency: 'coins',
              round_id: id.toString(),
            });
          await this.history.recordOne(tx, {
            userId,
            game: 'lucky_fruit',
            roundRef: id.toString(),
            bet: t.bet,
            payout: t.payout,
            detail: { winning_item: winner, bonus_items: bonus },
          });
        }
        const opensAt = new Date(now.getTime() + LF_RESULT_SECONDS * 1000);
        await tx.luckyFruitRound.create({ data: { opensAt, closesAt: new Date(opensAt.getTime() + LF_BETTING_SECONDS * 1000) } });
        return true;
      },
      { timeout: 20_000 },
    );
    return done;
  }

  /** Called every second by the engine. Does nothing unless a round is open, so an idle game costs one tiny query. */
  async tick() {
    if (!(await this.settings()).enabled) return;
    await this.settleIfDue();
  }

  // ---------- player ----------
  private async todayStats(userId: bigint) {
    const agg = await this.prisma.luckyFruitBet.aggregate({
      where: { userId, createdAt: { gte: istMidnight() } },
      _sum: { amount: true, payout: true },
    });
    return { turnover: agg._sum.amount ?? 0n, win: agg._sum.payout ?? 0n };
  }

  private async userRoundBets(userId: bigint, roundId: bigint) {
    const rows = await this.prisma.luckyFruitBet.groupBy({
      by: ['item'],
      where: { roundId, userId },
      _sum: { amount: true, payout: true },
    });
    const bets: Record<string, number> = {};
    let total = 0;
    let payout = 0;
    for (const r of rows) {
      bets[r.item] = Number(r._sum.amount ?? 0n);
      total += bets[r.item];
      payout += Number(r._sum.payout ?? 0n);
    }
    return { bets, total, payout };
  }

  private resultOf(r: { id: bigint; winningItem: string | null; bonusItems: unknown; settledAt: Date | null }) {
    return {
      round_id: Number(r.id),
      winning_item: r.winningItem,
      bonus_items: (r.bonusItems as string[] | null) ?? [],
      age_ms: r.settledAt ? Date.now() - r.settledAt.getTime() : 0,
    };
  }

  async state(userId: bigint) {
    const s = await this.settings();
    if (!s.enabled) return { enabled: false };
    await this.ensureRound();
    await this.settleIfDue();
    const round = await this.ensureRound();
    const now = Date.now();
    const [user, stats, claims, recent, last] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { walletBalance: true } }),
      this.todayStats(userId),
      this.prisma.luckyFruitChestClaim.findMany({ where: { userId, day: istDay() }, select: { tier: true } }),
      this.prisma.luckyFruitRound.findMany({ where: { phase: 'completed' }, orderBy: { id: 'desc' }, take: 12, select: { winningItem: true } }),
      this.prisma.luckyFruitRound.findFirst({ where: { phase: 'completed' }, orderBy: { id: 'desc' } }),
    ]);
    const phase = now < round.opensAt.getTime() ? 'result' : now < round.closesAt.getTime() ? 'betting' : 'drawing';
    const mine = await this.userRoundBets(userId, round.id);
    const claimed = new Set(claims.map((c) => c.tier));
    let lastResult: (ReturnType<LuckyFruitService['resultOf']> & { user_bet: number; user_payout: number }) | null = null;
    if (last && phase === 'result') {
      const m = await this.userRoundBets(userId, last.id);
      lastResult = { ...this.resultOf(last), user_bet: m.total, user_payout: m.payout };
    }
    return {
      enabled: true,
      round_id: Number(round.id),
      phase,
      seconds_remaining: secs((phase === 'result' ? round.opensAt : round.closesAt).getTime() - now),
      user_balance: Number(user.walletBalance),
      user_bets: mine.bets,
      user_total_bet: mine.total,
      today_win: Number(stats.win),
      turnover: Number(stats.turnover),
      chests: LF_CHEST_TARGETS.map((target, tier) => ({
        tier,
        target,
        reward: s.chestRewards[tier],
        claimed: claimed.has(tier),
        reached: stats.turnover >= BigInt(target),
      })),
      history: recent.map((r) => r.winningItem),
      last_result: lastResult,
      chips: LF_CHIPS,
      max_round_bet: s.maxRoundBet,
      bonus_pct: s.bonusPct,
    };
  }

  /** The decided result of one round for this player (the phone polls this right after betting closes). */
  async result(userId: bigint, roundId: bigint) {
    await this.settleIfDue(roundId);
    const r = await this.prisma.luckyFruitRound.findUnique({ where: { id: roundId } });
    if (!r) fail('NOT_FOUND', 'Round not found');
    if (r.phase !== 'completed') return { ready: false };
    const [m, user] = await Promise.all([
      this.userRoundBets(userId, roundId),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { walletBalance: true } }),
    ]);
    return {
      ready: true,
      ...this.resultOf(r),
      user_bets: m.bets,
      user_bet: m.total,
      user_payout: m.payout,
      user_balance: Number(user.walletBalance),
      today_win: Number((await this.todayStats(userId)).win),
    };
  }

  async bet(userId: bigint, itemRaw: unknown, amountRaw: unknown, requestId: unknown) {
    const s = await this.settings();
    if (!s.enabled) fail('DISABLED', 'Lucky Fruit is not available yet');
    const item = typeof itemRaw === 'string' ? itemRaw : '';
    if (!LF_FRUITS.includes(item)) fail('INVALID_OPTION', 'Choose a fruit');
    // A number only: strings must not be coerced into a valid chip.
    const amount = typeof amountRaw === 'number' ? amountRaw : NaN;
    if (!(LF_CHIPS as readonly number[]).includes(amount)) fail('INVALID_AMOUNT', 'Choose a chip');
    if (typeof requestId !== 'string' || !UUID_RE.test(requestId)) fail('BAD_REQUEST', 'request_id must be a uuid');
    const uuid = requestId.toLowerCase();
    this.games.assertCanPlay(await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true, staffBadgeType: true } }));

    const round = await this.ensureRound();
    const closed = () => fail('BETTING_CLOSED', 'Betting is closed');
    const lockKey = `lucky_fruit_bet_${userId}`;
    const balance = await this.prisma
      .$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
        const prior = await tx.luckyFruitBet.findUnique({ where: { userId_clientUuid: { userId, clientUuid: uuid } } });
        if (prior) {
          const u = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { walletBalance: true } });
          return u.walletBalance; // retry of a tap the server already took: no second charge
        }
        // Shared lock: settlement takes FOR UPDATE on the round, so a bet never lands in a round being settled.
        const cur = await tx.$queryRaw<Array<{ phase: string; opens_at: Date; closes_at: Date }>>`SELECT phase, opens_at, closes_at FROM lucky_fruit_rounds WHERE id = ${round.id} FOR SHARE`;
        const c = cur[0];
        const now = Date.now();
        if (!c || c.phase !== 'betting' || now < new Date(c.opens_at).getTime() || new Date(c.closes_at).getTime() - now <= LF_CLOSE_GUARD_MS) closed();
        const mine = await tx.luckyFruitBet.aggregate({ where: { roundId: round.id, userId }, _sum: { amount: true } });
        if (Number(mine._sum.amount ?? 0n) + amount > s.maxRoundBet) fail('MAX_BET', 'Round bet limit reached');
        let after: bigint;
        try {
          after = (
            await this.ledger.debitCoins(tx, userId, amount, 'GAME_LUCKY_FRUIT', `Lucky Fruit ${item}`, `lucky_fruit:bet:${uuid}`, undefined, {
              source: 'game',
              currency: 'coins',
              round_id: round.id.toString(),
              item,
            })
          ).after;
        } catch (e) {
          if ((e as { code?: string }).code === 'INSUFFICIENT_BALANCE') fail('INSUFFICIENT_BALANCE', 'Not enough coins');
          throw e;
        }
        await tx.luckyFruitBet.create({ data: { roundId: round.id, userId, item, amount: BigInt(amount), clientUuid: uuid } });
        return after;
      })
      .catch((e) => {
        if ((e as { code?: string }).code === 'P2002') return null; // two copies of one request raced
        throw e;
      });
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { walletBalance: true } });
    const mine = await this.userRoundBets(userId, round.id);
    return { round_id: Number(round.id), item, user_bets: mine.bets, user_total_bet: mine.total, balance: Number((balance ?? user.walletBalance) as bigint) };
  }

  async claimChest(userId: bigint, tierRaw: unknown) {
    const s = await this.settings();
    if (!s.enabled) fail('DISABLED', 'Lucky Fruit is not available yet');
    const tier = typeof tierRaw === 'number' ? tierRaw : NaN;
    if (!Number.isInteger(tier) || tier < 0 || tier >= LF_CHEST_TARGETS.length) fail('BAD_REQUEST', 'Unknown chest');
    const reward = s.chestRewards[tier];
    if (reward <= 0) fail('NO_REWARD', 'This chest has no reward right now');
    const day = istDay();
    return this.prisma.$transaction(async (tx) => {
      const locked = await this.ledger.lockUser(tx, userId);
      if (!locked) fail('USER_NOT_FOUND', 'User not found');
      const turnover = (await tx.luckyFruitBet.aggregate({ where: { userId, createdAt: { gte: istMidnight() } }, _sum: { amount: true } }))._sum.amount ?? 0n;
      if (turnover < BigInt(LF_CHEST_TARGETS[tier])) fail('NOT_REACHED', 'Play more to open this chest');
      if (await tx.luckyFruitChestClaim.findUnique({ where: { userId_day_tier: { userId, day, tier } } })) fail('ALREADY_CLAIMED', 'Already opened today');
      await tx.luckyFruitChestClaim.create({ data: { userId, day, tier, reward: BigInt(reward) } });
      const balance = await this.ledger.creditCoins(tx, userId, reward, 'GAME_LUCKY_FRUIT_CHEST', 'Lucky Fruit chest', `lucky_fruit:chest:${day}:${tier}`, locked, {
        source: 'game',
        currency: 'coins',
        tier,
      });
      return { tier, reward, balance: Number(balance) };
    });
  }
}

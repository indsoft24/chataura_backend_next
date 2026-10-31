import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  HistoryGame,
  HistoryResult,
  parseCursor,
  parseGame,
  parseLimit,
  parseResult,
  resultOf,
} from './game-history.rules';

type Tx = Prisma.TransactionClient;

const IST_OFFSET_MS = 330 * 60_000;

@Injectable()
export class GameHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  /** One row for a single spin (Lucky Slots, Lucky Spin). Call inside the transaction that moved the coins. */
  async recordOne(
    tx: Tx,
    p: { userId: bigint; game: HistoryGame; roundRef: string; bet: bigint; payout: bigint; detail?: Prisma.InputJsonValue },
  ) {
    await tx.gameHistory.createMany({
      data: [
        {
          userId: p.userId,
          game: p.game,
          roundRef: p.roundRef,
          totalBet: p.bet,
          payout: p.payout,
          net: p.payout - p.bet,
          result: resultOf(p.bet, p.payout),
          detail: p.detail,
        },
      ],
      skipDuplicates: true,
    });
  }

  /** One row per user for a settled Greedy / Lucky 77 round (win = any pick hit), set-based so a 100-player round stays one statement. */
  async recordRound(tx: Tx, game: 'greedy' | 'lucky77', roundId: bigint) {
    if (game === 'greedy') {
      await tx.$executeRaw`
        INSERT INTO game_history (user_id, game, round_ref, total_bet, payout, net, result, detail, settled_at)
        SELECT b.user_id, 'greedy', b.round_id::text, SUM(b.chip_amount), SUM(b.actual_payout),
          SUM(b.actual_payout) - SUM(b.chip_amount),
          CASE WHEN SUM(b.actual_payout) > 0 THEN 'win' ELSE 'loss' END,
          jsonb_build_object('winning_item', r.winning_item, 'multiplier', r.winning_multiplier,
            'picks', jsonb_agg(jsonb_build_object('item', b.item, 'bet', b.chip_amount))),
          COALESCE(r.settled_at, now())
        FROM greedy_bets b JOIN greedy_rounds r ON r.id = b.round_id
        WHERE b.round_id = ${roundId}
        GROUP BY b.user_id, b.round_id, r.winning_item, r.winning_multiplier, r.settled_at
        ON CONFLICT (user_id, game, round_ref) DO NOTHING`;
    } else {
      await tx.$executeRaw`
        INSERT INTO game_history (user_id, game, round_ref, total_bet, payout, net, result, detail, settled_at)
        SELECT b.user_id, 'lucky77', b.round_id::text, SUM(b.chip_amount), SUM(b.actual_payout),
          SUM(b.actual_payout) - SUM(b.chip_amount),
          CASE WHEN SUM(b.actual_payout) > 0 THEN 'win' ELSE 'loss' END,
          jsonb_build_object('winning_item', r.winning_item, 'multiplier', r.winning_multiplier,
            'picks', jsonb_agg(jsonb_build_object('item', b.option, 'bet', b.chip_amount))),
          COALESCE(r.settled_at, now())
        FROM lucky77_bets b JOIN lucky77_rounds r ON r.id = b.round_id
        WHERE b.round_id = ${roundId}
        GROUP BY b.user_id, b.round_id, r.winning_item, r.winning_multiplier, r.settled_at
        ON CONFLICT (user_id, game, round_ref) DO NOTHING`;
    }
  }

  private where(userId: bigint | undefined, q: { game?: unknown; result?: unknown; cursor?: unknown }) {
    const game = parseGame(q.game);
    const result = parseResult(q.result);
    const cursor = parseCursor(q.cursor);
    return {
      ...(userId !== undefined ? { userId } : {}),
      ...(game ? { game } : {}),
      ...(result ? { result } : {}),
      ...(cursor ? { id: { lt: cursor } } : {}),
    } satisfies Prisma.GameHistoryWhereInput;
  }

  private row(r: Prisma.GameHistoryGetPayload<object>) {
    return {
      id: r.id.toString(),
      game: r.game,
      round_ref: r.roundRef,
      total_bet: Number(r.totalBet),
      payout: Number(r.payout),
      net: Number(r.net),
      result: r.result as HistoryResult,
      detail: r.detail,
      at: r.settledAt.toISOString(),
    };
  }

  /** A user's own history, newest first, paged by cursor (id of the last row of the previous page). */
  async list(userId: bigint, q: { game?: unknown; result?: unknown; cursor?: unknown; limit?: unknown }) {
    const limit = parseLimit(q.limit);
    const rows = await this.prisma.gameHistory.findMany({
      where: this.where(userId, q),
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    return {
      items: page.map((r) => this.row(r)),
      next_cursor: rows.length > limit ? page[page.length - 1].id.toString() : null,
    };
  }

  /** Today's (IST) and all-time totals for the sheet header, optionally for one game. */
  async summary(userId: bigint, game?: unknown) {
    const g = parseGame(game);
    const istNow = new Date(Date.now() + IST_OFFSET_MS);
    const dayStart = new Date(
      Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()) - IST_OFFSET_MS,
    );
    const base: Prisma.GameHistoryWhereInput = { userId, ...(g ? { game: g } : {}) };
    const [today, all] = await Promise.all([
      this.prisma.gameHistory.aggregate({
        where: { ...base, settledAt: { gte: dayStart } },
        _sum: { totalBet: true, payout: true, net: true },
        _count: true,
      }),
      this.prisma.gameHistory.aggregate({ where: base, _sum: { totalBet: true, payout: true, net: true }, _count: true }),
    ]);
    const pack = (a: typeof today) => ({
      rounds: a._count,
      bet: Number(a._sum.totalBet ?? 0n),
      win: Number(a._sum.payout ?? 0n),
      net: Number(a._sum.net ?? 0n),
    });
    return { today: pack(today), total: pack(all) };
  }

  /** Admin view: any user, with an optional user filter and date range; totals cover the whole filter. */
  async adminList(q: {
    user_id?: unknown;
    game?: unknown;
    result?: unknown;
    cursor?: unknown;
    limit?: unknown;
    from?: unknown;
    to?: unknown;
  }) {
    const uid = typeof q.user_id === 'string' && /^[0-9]{1,18}$/.test(q.user_id) ? BigInt(q.user_id) : undefined;
    const date = (v: unknown) => {
      const d = typeof v === 'string' ? new Date(v) : null;
      return d && !Number.isNaN(d.getTime()) ? d : undefined;
    };
    const from = date(q.from);
    const to = date(q.to);
    const where: Prisma.GameHistoryWhereInput = {
      ...this.where(uid, q),
      ...(from || to ? { settledAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    };
    const limit = parseLimit(q.limit);
    const totalsWhere = { ...where };
    delete (totalsWhere as { id?: unknown }).id;
    const [rows, totals] = await Promise.all([
      this.prisma.gameHistory.findMany({ where, orderBy: { id: 'desc' }, take: limit + 1 }),
      this.prisma.gameHistory.aggregate({
        where: totalsWhere,
        _sum: { totalBet: true, payout: true },
        _count: true,
      }),
    ]);
    const page = rows.slice(0, limit);
    const bet = Number(totals._sum.totalBet ?? 0n);
    const paid = Number(totals._sum.payout ?? 0n);
    return {
      items: page.map((r) => ({ ...this.row(r), user_id: r.userId.toString() })),
      next_cursor: rows.length > limit ? page[page.length - 1].id.toString() : null,
      totals: { rounds: totals._count, bet, paid_out: paid, house_profit: bet - paid },
    };
  }
}

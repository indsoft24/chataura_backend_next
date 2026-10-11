import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import {
  LEDGER_REWARD_TYPES,
  REWARD_CATEGORIES,
  ROCKET_TITLE,
  RewardCategory,
  RewardCursor,
  SOURCE_LEDGER,
  SOURCE_ROCKET,
  decodeCursor,
  encodeCursor,
  includesRocket,
  ledgerSubtitle,
  ledgerTypesFor,
  periodStarts,
  rocketSubtitle,
  sameTimeRule,
} from './reward-history.rules';

type RewardRow = {
  src: number;
  id: bigint;
  created_at: Date;
  created_at_text: string;
  type: string;
  title: string | null;
  meta: Prisma.JsonValue;
  coins: bigint;
  gems: bigint;
  xp: number;
  frame_id: bigint | null;
  frame_name: string | null;
  frame_days: number | null;
  frame_image_url: string | null;
  frame_animation_url: string | null;
  rocket_room_id: string | null;
  rocket_rank: number | null;
};

type Totals = { coins: number; gems: number; xp: number; frames: number };
const emptyTotals = (): Totals => ({ coins: 0, gems: 0, xp: 0, frames: 0 });

const SUMMARY_TTL_SECONDS = 60;

/** Party tier id stored in ledger meta (number or numeric string), else null. */
const tierIdOf = (m: Record<string, unknown> | null): string | null => {
  const v = m?.tier_id;
  if (typeof v === 'number' && Number.isInteger(v)) return String(v);
  if (typeof v === 'string' && /^\d+$/.test(v)) return v;
  return null;
};

/** Gems a ledger reward row granted (only party-room gem rewards carry them). */
const gemsExpr = Prisma.sql`CASE WHEN type = 'PARTY_GEMS'
  THEN COALESCE((meta->>'gems_delta')::bigint, 0) ELSE 0 END`;

@Injectable()
export class RewardHistoryService {
  private readonly logger = new Logger(RewardHistoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * One page of the user's rewards, newest first. The summary comes with the first page only.
   */
  async history(
    userId: bigint,
    opts: {
      cursor?: string | null;
      limit?: number;
      category: RewardCategory | null;
      tzOffsetMinutes: number;
      fresh?: boolean;
    },
  ) {
    const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 20) || 20, 1), 50);
    const cursor = decodeCursor(opts.cursor);
    const rows = await this.pageRows(userId, opts.category, cursor, limit + 1);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const items = await this.toItems(page);
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor({
            at: last.created_at_text,
            src: last.src,
            id: last.id.toString(),
          })
        : null;

    return {
      items,
      next_cursor: nextCursor,
      summary: cursor
        ? null
        : await this.summary(userId, opts.tzOffsetMinutes, opts.fresh === true),
    };
  }

  private async pageRows(
    userId: bigint,
    category: RewardCategory | null,
    cursor: RewardCursor | null,
    take: number,
  ): Promise<RewardRow[]> {
    const branches: Prisma.Sql[] = [];
    const types = ledgerTypesFor(category);

    if (types.length) {
      branches.push(Prisma.sql`(
        SELECT ${SOURCE_LEDGER}::int AS src, ct.id, ct.created_at,
               ct.created_at::text AS created_at_text, ct.type, ct.title, ct.meta,
               ct.coin_amount AS coins,
               CASE WHEN ct.type = 'PARTY_GEMS'
                    THEN COALESCE((ct.meta->>'gems_delta')::bigint, 0) ELSE 0 END AS gems,
               0 AS xp, NULL::bigint AS frame_id, NULL::text AS frame_name,
               NULL::int AS frame_days, NULL::text AS frame_image_url,
               NULL::text AS frame_animation_url, NULL::uuid AS rocket_room_id,
               NULL::int AS rocket_rank
        FROM coin_transactions ct
        WHERE ct.user_id = ${userId}
          AND ct.type IN (${Prisma.join(types)})
          AND ct.status = 'success'
          ${this.cursorFilter(Prisma.sql`ct.created_at`, Prisma.sql`ct.id`, SOURCE_LEDGER, cursor)}
        ORDER BY ct.created_at DESC, ct.id DESC
        LIMIT ${take}
      )`);
    }

    if (includesRocket(category)) {
      // Rank = position among the launch's winners (rewards are created in rank order).
      branches.push(Prisma.sql`(
        SELECT ${SOURCE_ROCKET}::int AS src, rr.id, rl.created_at,
               rl.created_at::text AS created_at_text, 'ROCKET_REWARD' AS type,
               NULL::text AS title, NULL::jsonb AS meta,
               rr.coins::bigint AS coins, 0::bigint AS gems, rr.xp,
               rr.frame_id, COALESCE(rr.frame_name, f.name) AS frame_name,
               rr.frame_days, f.image_url AS frame_image_url,
               f.animation_url AS frame_animation_url, rl.room_id AS rocket_room_id,
               (SELECT COUNT(*)::int FROM rocket_rewards o
                 WHERE o.launch_id = rr.launch_id AND o.id <= rr.id) AS rocket_rank
        FROM rocket_rewards rr
        JOIN rocket_launches rl ON rl.id = rr.launch_id
        LEFT JOIN frames f ON f.id = rr.frame_id
        WHERE rr.user_id = ${userId}
          ${this.cursorFilter(Prisma.sql`rl.created_at`, Prisma.sql`rr.id`, SOURCE_ROCKET, cursor)}
        ORDER BY rl.created_at DESC, rr.id DESC
        LIMIT ${take}
      )`);
    }

    if (!branches.length) return [];
    return this.prisma.$queryRaw<RewardRow[]>`
      SELECT * FROM (${Prisma.join(branches, ' UNION ALL ')}) r
      ORDER BY r.created_at DESC, r.src DESC, r.id DESC
      LIMIT ${take}`;
  }

  /** Rows strictly after [cursor] in (created_at DESC, src DESC, id DESC) order. */
  private cursorFilter(
    at: Prisma.Sql,
    id: Prisma.Sql,
    src: number,
    cursor: RewardCursor | null,
  ): Prisma.Sql {
    if (!cursor) return Prisma.empty;
    const c = Prisma.sql`${cursor.at}::timestamptz`;
    switch (sameTimeRule(src, cursor)) {
      case 'all':
        return Prisma.sql`AND ${at} <= ${c}`;
      case 'none':
        return Prisma.sql`AND ${at} < ${c}`;
      default:
        return Prisma.sql`AND ${at} <= ${c}
          AND (${at} < ${c} OR ${id} < ${BigInt(cursor.id)})`;
    }
  }

  /** Shapes rows for the app; room names and stay minutes are looked up once per page. */
  private async toItems(rows: RewardRow[]) {
    const meta = (r: RewardRow) =>
      r.meta && typeof r.meta === 'object' && !Array.isArray(r.meta)
        ? (r.meta as Record<string, unknown>)
        : null;

    const roomIds = new Set<string>();
    const tierIds = new Set<string>();
    for (const r of rows) {
      const m = meta(r);
      const roomId =
        r.rocket_room_id ?? (typeof m?.room_id === 'string' ? m.room_id : null);
      if (roomId) roomIds.add(roomId);
      const tierId = tierIdOf(m);
      if (tierId) tierIds.add(tierId);
    }
    const [rooms, tiers] = await Promise.all([
      roomIds.size
        ? this.prisma.room.findMany({
            where: { id: { in: [...roomIds] } },
            select: { id: true, title: true },
          })
        : Promise.resolve([]),
      tierIds.size
        ? this.prisma.partyRoomBonusTier.findMany({
            where: {
              id: {
                in: [...tierIds].filter((t) => /^\d+$/.test(t)).map(BigInt),
              },
            },
            select: { id: true, durationMinutes: true },
          })
        : Promise.resolve([]),
    ]);
    const roomName = new Map(rooms.map((r) => [r.id, r.title]));
    const tierMinutes = new Map(
      tiers.map((t) => [t.id.toString(), t.durationMinutes]),
    );

    return rows.map((r) => {
      const createdAt = r.created_at.toISOString();
      if (r.src === SOURCE_ROCKET) {
        const room = r.rocket_room_id
          ? (roomName.get(r.rocket_room_id) ?? null)
          : null;
        return {
          id: `rocket_${r.id}`,
          category: 'rocket' as const,
          type: 'ROCKET_REWARD',
          title: ROCKET_TITLE,
          subtitle: rocketSubtitle(room, r.rocket_rank),
          coins: Number(r.coins),
          gems: 0,
          xp: r.xp,
          frame:
            r.frame_id != null
              ? {
                  id: Number(r.frame_id),
                  name: r.frame_name,
                  days: r.frame_days,
                  image_url: r.frame_image_url,
                  animation_url: r.frame_animation_url,
                }
              : null,
          created_at: createdAt,
        };
      }
      const m = meta(r);
      const def = LEDGER_REWARD_TYPES[r.type];
      const room =
        typeof m?.room_id === 'string'
          ? (roomName.get(m.room_id) ?? null)
          : null;
      const minutes =
        tierIdOf(m) != null ? (tierMinutes.get(tierIdOf(m)!) ?? null) : null;
      return {
        id: `ledger_${r.id}`,
        category: def?.category ?? 'bonuses',
        type: r.type,
        title: def?.title ?? r.title ?? 'Reward',
        subtitle: ledgerSubtitle(r.type, r.title, m, {
          roomName: room,
          minutes,
        }),
        coins: Number(r.coins),
        gems: Number(r.gems),
        xp: 0,
        frame: null,
        created_at: createdAt,
      };
    });
  }

  /**
   * Today / this month / all-time totals plus per-category totals. Cached briefly per user and
   * time zone; pull-to-refresh passes fresh=true.
   */
  private async summary(
    userId: bigint,
    tzOffsetMinutes: number,
    fresh: boolean,
  ) {
    const key = `rewards:summary:${userId}:${tzOffsetMinutes}`;
    const client = this.redis.getClient();
    if (!fresh) {
      const cached = await client.get(key).catch(() => null);
      if (cached) {
        try {
          return JSON.parse(cached) as unknown;
        } catch {
          // fall through and rebuild
        }
      }
    }
    const built = await this.buildSummary(userId, tzOffsetMinutes);
    await client
      .set(key, JSON.stringify(built), 'EX', SUMMARY_TTL_SECONDS)
      .catch((e: unknown) => this.logger.warn(`summary cache: ${String(e)}`));
    return built;
  }

  private async buildSummary(userId: bigint, tzOffsetMinutes: number) {
    const { today, month } = periodStarts(new Date(), tzOffsetMinutes);
    const types = ledgerTypesFor(null);
    const [ledger, rocket] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          type: string;
          n: number;
          coins: bigint;
          gems: bigint;
          coins_today: bigint;
          gems_today: bigint;
          coins_month: bigint;
          gems_month: bigint;
        }>
      >`
        SELECT type, COUNT(*)::int AS n,
               COALESCE(SUM(coin_amount), 0)::bigint AS coins,
               COALESCE(SUM(${gemsExpr}), 0)::bigint AS gems,
               COALESCE(SUM(coin_amount) FILTER (WHERE created_at >= ${today}), 0)::bigint AS coins_today,
               COALESCE(SUM(${gemsExpr}) FILTER (WHERE created_at >= ${today}), 0)::bigint AS gems_today,
               COALESCE(SUM(coin_amount) FILTER (WHERE created_at >= ${month}), 0)::bigint AS coins_month,
               COALESCE(SUM(${gemsExpr}) FILTER (WHERE created_at >= ${month}), 0)::bigint AS gems_month
        FROM coin_transactions
        WHERE user_id = ${userId} AND type IN (${Prisma.join(types)}) AND status = 'success'
        GROUP BY type`,
      this.prisma.$queryRaw<
        Array<{
          n: number;
          coins: bigint;
          xp: bigint;
          frames: number;
          coins_today: bigint;
          xp_today: bigint;
          frames_today: number;
          coins_month: bigint;
          xp_month: bigint;
          frames_month: number;
        }>
      >`
        SELECT COUNT(*)::int AS n,
               COALESCE(SUM(rr.coins), 0)::bigint AS coins,
               COALESCE(SUM(rr.xp), 0)::bigint AS xp,
               COUNT(rr.frame_id)::int AS frames,
               COALESCE(SUM(rr.coins) FILTER (WHERE rl.created_at >= ${today}), 0)::bigint AS coins_today,
               COALESCE(SUM(rr.xp) FILTER (WHERE rl.created_at >= ${today}), 0)::bigint AS xp_today,
               COUNT(rr.frame_id) FILTER (WHERE rl.created_at >= ${today})::int AS frames_today,
               COALESCE(SUM(rr.coins) FILTER (WHERE rl.created_at >= ${month}), 0)::bigint AS coins_month,
               COALESCE(SUM(rr.xp) FILTER (WHERE rl.created_at >= ${month}), 0)::bigint AS xp_month,
               COUNT(rr.frame_id) FILTER (WHERE rl.created_at >= ${month})::int AS frames_month
        FROM rocket_rewards rr
        JOIN rocket_launches rl ON rl.id = rr.launch_id
        WHERE rr.user_id = ${userId}`,
    ]);

    const periods = {
      today: emptyTotals(),
      month: emptyTotals(),
      all: emptyTotals(),
    };
    const categories = Object.fromEntries(
      REWARD_CATEGORIES.map((c) => [c, { count: 0, ...emptyTotals() }]),
    ) as Record<RewardCategory, { count: number } & Totals>;

    for (const row of ledger) {
      const cat = LEDGER_REWARD_TYPES[row.type]?.category;
      if (!cat) continue;
      categories[cat].count += row.n;
      categories[cat].coins += Number(row.coins);
      categories[cat].gems += Number(row.gems);
      periods.all.coins += Number(row.coins);
      periods.all.gems += Number(row.gems);
      periods.today.coins += Number(row.coins_today);
      periods.today.gems += Number(row.gems_today);
      periods.month.coins += Number(row.coins_month);
      periods.month.gems += Number(row.gems_month);
    }
    const rk = rocket[0];
    if (rk) {
      Object.assign(categories.rocket, {
        count: rk.n,
        coins: Number(rk.coins),
        xp: Number(rk.xp),
        frames: rk.frames,
      });
      const add = (t: Totals, coins: bigint, xp: bigint, frames: number) => {
        t.coins += Number(coins);
        t.xp += Number(xp);
        t.frames += frames;
      };
      add(periods.all, rk.coins, rk.xp, rk.frames);
      add(periods.today, rk.coins_today, rk.xp_today, rk.frames_today);
      add(periods.month, rk.coins_month, rk.xp_month, rk.frames_month);
    }
    return { ...periods, categories };
  }
}

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  isPeriodType,
  periodCreatedAtFilter,
  periodKey,
  type PeriodType,
} from '../relationship/relationship-period';

const SPEND_TYPES = ['GIFT', 'ROCKET'] as const;

@Injectable()
export class RankingsService {
  constructor(private readonly prisma: PrismaService) {}

  async personalSpend(
    periodRaw: string | undefined,
    limitRaw: string | undefined,
    viewerId: bigint | null,
  ) {
    const period: PeriodType = isPeriodType(periodRaw) ? periodRaw : 'all_time';
    const limit = Math.min(Math.max(Number(limitRaw ?? 50) || 50, 1), 100);
    const createdAt = periodCreatedAtFilter(period);

    const where: Prisma.CoinTransactionWhereInput = {
      type: { in: [...SPEND_TYPES] },
      coinAmount: { lt: 0 },
      ...(createdAt
        ? { createdAt: { gte: createdAt.gte, lt: createdAt.lt } }
        : {}),
    };

    const rows = await this.prisma.coinTransaction.groupBy({
      by: ['userId'],
      where,
      _sum: { coinAmount: true },
      orderBy: { _sum: { coinAmount: 'asc' } }, // more negative = more spend
      take: limit,
    });

    // groupBy orderBy on _sum can be flaky across providers — sort in memory.
    const scored = rows
      .map((r) => ({
        userId: r.userId,
        coins: Math.abs(Number(r._sum.coinAmount ?? 0)),
      }))
      .filter((r) => r.coins > 0)
      .sort((a, b) => b.coins - a.coins)
      .slice(0, limit);

    const users = await this.prisma.user.findMany({
      where: { id: { in: scored.map((s) => s.userId) } },
      select: {
        id: true,
        displayName: true,
        name: true,
        avatarUrl: true,
      },
    });
    const byId = new Map(users.map((u) => [u.id.toString(), u]));

    const items = scored.map((s, i) => {
      const u = byId.get(s.userId.toString());
      return {
        rank: i + 1,
        user_id: Number(s.userId),
        name: u?.displayName || u?.name || 'User',
        avatar_url: u?.avatarUrl ?? null,
        coins: s.coins,
      };
    });

    let me: {
      rank: number | null;
      coins: number;
      user_id: number;
      name: string;
      avatar_url: string | null;
    } | null = null;

    if (viewerId) {
      const inList = items.find((it) => it.user_id === Number(viewerId));
      if (inList) {
        me = {
          rank: inList.rank,
          coins: inList.coins,
          user_id: inList.user_id,
          name: inList.name,
          avatar_url: inList.avatar_url,
        };
      } else {
        const agg = await this.prisma.coinTransaction.aggregate({
          where: { ...where, userId: viewerId },
          _sum: { coinAmount: true },
        });
        const coins = Math.abs(Number(agg._sum.coinAmount ?? 0));
        const viewer = await this.prisma.user.findUnique({
          where: { id: viewerId },
          select: { displayName: true, name: true, avatarUrl: true },
        });
        // Approximate rank: count users with higher spend.
        let rank: number | null = null;
        if (coins > 0) {
          const higher = await this.prisma.$queryRaw<Array<{ c: bigint }>>`
            SELECT COUNT(*)::bigint AS c FROM (
              SELECT user_id
              FROM coin_transactions
              WHERE type IN ('GIFT', 'ROCKET')
                AND coin_amount < 0
                ${createdAt?.gte ? Prisma.sql`AND created_at >= ${createdAt.gte}` : Prisma.empty}
                ${createdAt?.lt ? Prisma.sql`AND created_at < ${createdAt.lt}` : Prisma.empty}
              GROUP BY user_id
              HAVING SUM(ABS(coin_amount)) > ${coins}
            ) t
          `;
          rank = Number(higher[0]?.c ?? 0) + 1;
        }
        me = {
          rank,
          coins,
          user_id: Number(viewerId),
          name: viewer?.displayName || viewer?.name || 'You',
          avatar_url: viewer?.avatarUrl ?? null,
        };
      }
    }

    return {
      period,
      period_key: periodKey(period),
      items,
      me,
    };
  }

  async roomSpend(
    periodRaw: string | undefined,
    limitRaw: string | undefined,
    viewerId: bigint | null,
  ) {
    const period: PeriodType = isPeriodType(periodRaw) ? periodRaw : 'all_time';
    const limit = Math.min(Math.max(Number(limitRaw ?? 50) || 50, 1), 100);
    const createdAt = periodCreatedAtFilter(period);

    const rows = await this.prisma.$queryRaw<
      Array<{ room_id: string; coins: bigint }>
    >`
      SELECT room_id, SUM(coins)::bigint AS coins FROM (
        SELECT
          COALESCE(
            meta->>'room_id',
            CASE
              WHEN reference_id LIKE 'room_%'
                THEN substring(reference_id from '^room_([0-9a-fA-F-]{36})_')
              ELSE NULL
            END
          ) AS room_id,
          ABS(coin_amount)::bigint AS coins
        FROM coin_transactions
        WHERE type IN ('GIFT', 'ROCKET')
          AND coin_amount < 0
          ${createdAt?.gte ? Prisma.sql`AND created_at >= ${createdAt.gte}` : Prisma.empty}
          ${createdAt?.lt ? Prisma.sql`AND created_at < ${createdAt.lt}` : Prisma.empty}
      ) t
      WHERE room_id IS NOT NULL
      GROUP BY room_id
      ORDER BY coins DESC
      LIMIT ${limit * 3}
    `;

    const roomIds = rows.map((r) => r.room_id).filter(Boolean);
    const publicRooms = await this.prisma.room.findMany({
      where: {
        id: { in: roomIds },
        isPrivate: false,
      },
      select: {
        id: true,
        displayId: true,
        title: true,
        coverImageUrl: true,
        ownerId: true,
      },
    });
    const owners = await this.prisma.user.findMany({
      where: { id: { in: publicRooms.map((r) => r.ownerId) } },
      select: {
        id: true,
        displayName: true,
        name: true,
        avatarUrl: true,
      },
    });
    const ownerById = new Map(owners.map((o) => [o.id.toString(), o]));
    const roomById = new Map(publicRooms.map((r) => [r.id, r]));

    const items = rows
      .map((r) => {
        const room = roomById.get(r.room_id);
        if (!room) return null;
        const owner = ownerById.get(room.ownerId.toString());
        return {
          rank: 0,
          room_id: room.id,
          display_id: room.displayId,
          title: room.title,
          cover_image_url: room.coverImageUrl,
          coins: Number(r.coins),
          owner: {
            id: Number(room.ownerId),
            name: owner?.displayName || owner?.name || 'Host',
            avatar_url: owner?.avatarUrl ?? null,
          },
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
      .slice(0, limit)
      .map((it, i) => ({ ...it, rank: i + 1 }));

    let me: {
      rank: number | null;
      coins: number;
      room_id: string | null;
      title: string | null;
    } | null = null;

    if (viewerId) {
      const owned = await this.prisma.room.findFirst({
        where: { ownerId: viewerId, isPrivate: false, isLive: true },
        orderBy: { lastActivityAt: 'desc' },
        select: { id: true, title: true },
      });
      if (owned) {
        const inList = items.find((it) => it.room_id === owned.id);
        if (inList) {
          me = {
            rank: inList.rank,
            coins: inList.coins,
            room_id: owned.id,
            title: owned.title,
          };
        } else {
          const mine = rows.find((r) => r.room_id === owned.id);
          me = {
            rank: null,
            coins: mine ? Number(mine.coins) : 0,
            room_id: owned.id,
            title: owned.title,
          };
        }
      }
    }

    return {
      period,
      period_key: periodKey(period),
      items,
      me,
    };
  }
}

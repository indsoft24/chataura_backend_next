import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  isPeriodType,
  periodCreatedAtFilter,
  periodKey,
  type PeriodType,
} from '../relationship/relationship-period';

/** Daily personal ranking slot i (0-based) owns RANK_FRAME_SLUGS[i] while holding that slot. */
export const RANK_FRAME_SLUGS = ['rank_frame_top1', 'rank_frame_top2', 'rank_frame_top3'] as const;

@Injectable()
export class RankingsService {
  private readonly logger = new Logger(RankingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Gives today's Top 1/2/3 (personal spend) their rank frame and takes it back from anyone who
   * lost the slot. Runs on every instance; an advisory lock lets only one do the work.
   */
  @Cron('*/2 * * * *')
  async syncRankFrames() {
    try {
      const { items } = await this.personalSpend('daily', String(RANK_FRAME_SLUGS.length), null);
      const frames = await this.prisma.frame.findMany({
        where: { slug: { in: [...RANK_FRAME_SLUGS] }, isActive: true },
        select: { id: true, slug: true },
      });
      const frameBySlug = new Map(frames.map((f) => [f.slug, f.id]));
      await this.prisma.$transaction(async (tx) => {
        const [lock] = await tx.$queryRaw<Array<{ locked: boolean }>>`
          SELECT pg_try_advisory_xact_lock(hashtext('rank_frames_sync')) AS locked`;
        if (!lock?.locked) return;
        for (let i = 0; i < RANK_FRAME_SLUGS.length; i++) {
          const frameId = frameBySlug.get(RANK_FRAME_SLUGS[i]);
          if (frameId == null) continue;
          const holder = items[i] ? BigInt(items[i].user_id) : null;
          const lost = await tx.userUnlockedFrame.findMany({
            where: { frameId, ...(holder != null ? { userId: { not: holder } } : {}) },
            select: { userId: true },
          });
          if (lost.length > 0) {
            const ids = lost.map((l) => l.userId);
            await tx.userUnlockedFrame.deleteMany({ where: { frameId, userId: { in: ids } } });
            await tx.user.updateMany({
              where: { id: { in: ids }, selectedFrameId: frameId },
              data: { selectedFrameId: null },
            });
          }
          if (holder != null) {
            await tx.userUnlockedFrame.upsert({
              where: { userId_frameId: { userId: holder, frameId } },
              create: { userId: holder, frameId, coinsPaid: 0, unlockType: 'rank' },
              update: { unlockType: 'rank', expiresAt: null, durationDays: null },
            });
          }
        }
      });
    } catch (e) {
      this.logger.warn(`rank frame sync failed: ${(e as Error).message}`);
    }
  }

  /**
   * Personal ranking. `giver` = coins spent (gifts sent + rocket); `receiver` = gift value received
   * (gross gems: net + commission). App tabs: Charm = giver, Honor = receiver.
   */
  async personalSpend(
    periodRaw: string | undefined,
    limitRaw: string | undefined,
    viewerId: bigint | null,
    typeRaw?: string,
  ) {
    const period: PeriodType = isPeriodType(periodRaw) ? periodRaw : 'all_time';
    const limit = Math.min(Math.max(Number(limitRaw ?? 50) || 50, 1), 100);
    const createdAt = periodCreatedAtFilter(period);
    const type = typeRaw === 'receiver' ? 'receiver' : 'giver';

    const filter =
      type === 'receiver'
        ? Prisma.sql`type = 'GIFT_RECEIVED'`
        : Prisma.sql`type IN ('GIFT', 'ROCKET') AND coin_amount < 0`;
    const score =
      type === 'receiver'
        ? Prisma.sql`SUM(COALESCE(net_amount, 0) + COALESCE(commission_amount, 0))`
        : Prisma.sql`SUM(ABS(coin_amount))`;
    const periodSql = Prisma.sql`
      ${createdAt?.gte ? Prisma.sql`AND created_at >= ${createdAt.gte}` : Prisma.empty}
      ${createdAt?.lt ? Prisma.sql`AND created_at < ${createdAt.lt}` : Prisma.empty}`;

    const rows = await this.prisma.$queryRaw<Array<{ user_id: bigint; coins: bigint }>>`
      SELECT user_id, ${score} AS coins
      FROM coin_transactions
      WHERE ${filter} ${periodSql}
      GROUP BY user_id
      HAVING ${score} > 0
      ORDER BY coins DESC, user_id ASC
      LIMIT ${limit}
    `;
    const scored = rows.map((r) => ({ userId: r.user_id, coins: Number(r.coins) }));

    const users = await this.prisma.user.findMany({
      where: { id: { in: scored.map((s) => s.userId) } },
      select: {
        id: true,
        displayName: true,
        name: true,
        avatarUrl: true,
        displayId: true,
      },
    });
    const byId = new Map(users.map((u) => [u.id.toString(), u]));

    const items = scored.map((s, i) => {
      const u = byId.get(s.userId.toString());
      return {
        rank: i + 1,
        user_id: Number(s.userId),
        display_id: u?.displayId ?? String(s.userId),
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
        const [mine] = await this.prisma.$queryRaw<Array<{ coins: bigint | null }>>`
          SELECT ${score} AS coins FROM coin_transactions
          WHERE user_id = ${viewerId} AND ${filter} ${periodSql}
        `;
        const coins = Number(mine?.coins ?? 0);
        const viewer = await this.prisma.user.findUnique({
          where: { id: viewerId },
          select: { displayName: true, name: true, avatarUrl: true },
        });
        // Approximate rank: count users with a higher score.
        let rank: number | null = null;
        if (coins > 0) {
          const higher = await this.prisma.$queryRaw<Array<{ c: bigint }>>`
            SELECT COUNT(*)::bigint AS c FROM (
              SELECT user_id FROM coin_transactions
              WHERE ${filter} ${periodSql}
              GROUP BY user_id
              HAVING ${score} > ${coins}
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
      type,
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

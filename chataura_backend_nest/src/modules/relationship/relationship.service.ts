import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RelationshipEngineService } from './relationship-engine.service';
import {
  PeriodType,
  isPeriodType,
  periodKey,
} from './relationship-period';

@Injectable()
export class RelationshipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: RelationshipEngineService,
  ) {}

  async listTypes(enabledOnly = true) {
    await this.engine.ensureDefaultTypes();
    const types = await this.prisma.relationshipType.findMany({
      where: enabledOnly ? { enabled: true } : undefined,
      orderBy: { sortOrder: 'asc' },
    });
    return {
      types: types.map((t) => this.mapType(t)),
    };
  }

  async listMine(
    userId: bigint,
    opts: { type?: string; limit?: number; cursor?: string } = {},
  ) {
    const take = Math.min(Math.max(opts.limit ?? 20, 1), 50);
    const type = opts.type
      ? await this.prisma.relationshipType.findFirst({
          where: { code: opts.type.toLowerCase() },
        })
      : null;

    const rows = await this.prisma.userRelationship.findMany({
      where: {
        status: 'active',
        OR: [{ userLowId: userId }, { userHighId: userId }],
        ...(type ? { relationshipTypeId: type.id } : {}),
        ...(opts.cursor ? { id: { lt: opts.cursor } } : {}),
      },
      include: { relationshipType: true },
      orderBy: [{ totalScore: 'desc' }, { id: 'desc' }],
      take: take + 1,
    });

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const items = await Promise.all(page.map((r) => this.mapRelationship(r)));
    return {
      items,
      next_cursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async getById(id: string) {
    const row = await this.prisma.userRelationship.findUnique({
      where: { id },
      include: { relationshipType: true },
    });
    if (!row) {
      throw new NotFoundException({
        success: false,
        error: { code: 'RELATIONSHIP_NOT_FOUND', message: 'Not found' },
      });
    }
    return this.mapRelationship(row);
  }

  async listForUser(
    userId: bigint,
    opts: { type?: string; limit?: number } = {},
  ) {
    return this.listMine(userId, opts);
  }

  /** Highest-scoring relationship per type (or overall if type omitted). */
  async primaryForUser(userId: bigint, typeCode?: string) {
    const type = typeCode
      ? await this.prisma.relationshipType.findFirst({
          where: { code: typeCode.toLowerCase(), enabled: true },
        })
      : null;

    const row = await this.prisma.userRelationship.findFirst({
      where: {
        status: 'active',
        OR: [{ userLowId: userId }, { userHighId: userId }],
        ...(type ? { relationshipTypeId: type.id } : {}),
      },
      include: { relationshipType: true },
      orderBy: { totalScore: 'desc' },
    });
    if (!row) return { primary: null };
    return { primary: await this.mapRelationship(row) };
  }

  async leaderboard(opts: {
    type: string;
    period?: string;
    scope?: string;
    room_id?: string;
    limit?: number;
    cursor?: string;
  }) {
    const type = await this.prisma.relationshipType.findFirst({
      where: { code: opts.type.toLowerCase(), enabled: true },
    });
    if (!type) {
      throw new NotFoundException({
        success: false,
        error: { code: 'TYPE_NOT_FOUND', message: 'Relationship type not found' },
      });
    }

    const period: PeriodType = isPeriodType(opts.period)
      ? opts.period
      : 'all_time';
    const scope = opts.scope === 'room' ? 'room' : 'global';
    if (scope === 'room' && !opts.room_id) {
      return { items: [], period, scope, type: type.code };
    }

    const roomKey = scope === 'room' ? String(opts.room_id) : '';
    const key = periodKey(period);
    const take = Math.min(Math.max(opts.limit ?? 50, 1), 100);

    const scores = await this.prisma.relationshipPeriodScore.findMany({
      where: {
        periodType: period,
        periodKey: key,
        roomKey,
        relationship: { relationshipTypeId: type.id, status: 'active' },
      },
      include: {
        relationship: { include: { relationshipType: true } },
      },
      orderBy: [{ score: 'desc' }, { relationshipId: 'asc' }],
      take,
    });

    const userIds = new Set<bigint>();
    for (const s of scores) {
      userIds.add(s.relationship.userLowId);
      userIds.add(s.relationship.userHighId);
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...userIds] } },
      select: { id: true, name: true, avatarUrl: true },
    });
    const byId = new Map(users.map((u) => [u.id.toString(), u]));

    const items = scores.map((s, idx) => {
      const rank = s.rank ?? idx + 1;
      const a = byId.get(s.relationship.userLowId.toString());
      const b = byId.get(s.relationship.userHighId.toString());
      return {
        rank,
        score: Number(s.score),
        relationship_id: s.relationshipId,
        type_code: type.code,
        users: [
          {
            id: Number(s.relationship.userLowId),
            name: a?.name ?? 'User',
            avatar_url: a?.avatarUrl ?? null,
          },
          {
            id: Number(s.relationship.userHighId),
            name: b?.name ?? 'User',
            avatar_url: b?.avatarUrl ?? null,
          },
        ],
        is_rank1: rank === 1,
        badges: rank === 1 ? ['rank1'] : [],
      };
    });

    return {
      type: type.code,
      period,
      scope,
      room_id: scope === 'room' ? opts.room_id : null,
      items,
    };
  }

  // ── Admin ──────────────────────────────────────────────────────────

  async adminListTypes() {
    await this.engine.ensureDefaultTypes();
    const types = await this.prisma.relationshipType.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    return { types: types.map((t) => this.mapType(t)) };
  }

  async adminUpsertType(body: {
    code: string;
    name: string;
    description?: string;
    enabled?: boolean;
    sort_order?: number;
    exclusivity_mode?: string;
    formation_rule?: string;
    requires_accept?: boolean;
    bidirectional_scoring?: boolean;
    quantity_multiplies_points?: boolean;
    levels_enabled?: boolean;
    dm_gifts_count?: boolean;
    room_gifts_count?: boolean;
    visual?: object;
    leaderboard?: object;
    rank1_rewards?: object;
  }) {
    const code = body.code.trim().toLowerCase();
    const row = await this.prisma.relationshipType.upsert({
      where: { code },
      create: {
        code,
        name: body.name,
        description: body.description,
        enabled: body.enabled ?? true,
        sortOrder: body.sort_order ?? 0,
        exclusivityMode: body.exclusivity_mode ?? 'none',
        formationRule: body.formation_rule ?? 'first_qualifying_gift',
        requiresAccept: body.requires_accept ?? false,
        bidirectionalScoring: body.bidirectional_scoring ?? true,
        quantityMultipliesPoints: body.quantity_multiplies_points ?? true,
        levelsEnabled: body.levels_enabled ?? false,
        dmGiftsCount: body.dm_gifts_count ?? true,
        roomGiftsCount: body.room_gifts_count ?? true,
        visual: body.visual ?? undefined,
        leaderboard: body.leaderboard ?? undefined,
        rank1Rewards: body.rank1_rewards ?? undefined,
      },
      update: {
        name: body.name,
        description: body.description,
        enabled: body.enabled,
        sortOrder: body.sort_order,
        exclusivityMode: body.exclusivity_mode,
        formationRule: body.formation_rule,
        requiresAccept: body.requires_accept,
        bidirectionalScoring: body.bidirectional_scoring,
        quantityMultipliesPoints: body.quantity_multiplies_points,
        levelsEnabled: body.levels_enabled,
        dmGiftsCount: body.dm_gifts_count,
        roomGiftsCount: body.room_gifts_count,
        visual: body.visual,
        leaderboard: body.leaderboard,
        rank1Rewards: body.rank1_rewards,
      },
    });
    return this.mapType(row);
  }

  async adminUpsertGiftRule(body: {
    gift_id: number | string;
    type_code: string;
    point_value: number;
    enabled?: boolean;
  }) {
    const type = await this.prisma.relationshipType.findFirst({
      where: { code: body.type_code.toLowerCase() },
    });
    if (!type) {
      throw new NotFoundException({
        success: false,
        error: { code: 'TYPE_NOT_FOUND', message: 'Type not found' },
      });
    }
    const giftId = BigInt(body.gift_id);
    const row = await this.prisma.relationshipGiftRule.upsert({
      where: {
        giftId_relationshipTypeId: {
          giftId,
          relationshipTypeId: type.id,
        },
      },
      create: {
        giftId,
        relationshipTypeId: type.id,
        pointValue: Number(body.point_value),
        enabled: body.enabled ?? true,
      },
      update: {
        pointValue: Number(body.point_value),
        enabled: body.enabled ?? true,
      },
    });
    return {
      id: row.id,
      gift_id: Number(row.giftId),
      type_code: type.code,
      point_value: row.pointValue,
      enabled: row.enabled,
    };
  }

  async adminSyncGiftRules() {
    await this.engine.syncGiftRulesFromCategories();
    const rules = await this.prisma.relationshipGiftRule.findMany({
      include: { relationshipType: true },
      orderBy: { giftId: 'asc' },
    });
    return {
      count: rules.length,
      rules: rules.map((r) => ({
        id: r.id,
        gift_id: Number(r.giftId),
        type_code: r.relationshipType.code,
        point_value: r.pointValue,
        enabled: r.enabled,
      })),
    };
  }

  async adminListGiftRules() {
    const rules = await this.prisma.relationshipGiftRule.findMany({
      include: { relationshipType: true },
      orderBy: { giftId: 'asc' },
    });
    return {
      rules: rules.map((r) => ({
        id: r.id,
        gift_id: Number(r.giftId),
        type_code: r.relationshipType.code,
        point_value: r.pointValue,
        enabled: r.enabled,
      })),
    };
  }

  // ── Mappers ────────────────────────────────────────────────────────

  private mapType(t: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    enabled: boolean;
    sortOrder: number;
    exclusivityMode: string;
    formationRule: string;
    requiresAccept: boolean;
    bidirectionalScoring: boolean;
    quantityMultipliesPoints: boolean;
    levelsEnabled: boolean;
    dmGiftsCount: boolean;
    roomGiftsCount: boolean;
    visual: unknown;
    leaderboard: unknown;
    rank1Rewards: unknown;
  }) {
    return {
      id: t.id,
      code: t.code,
      name: t.name,
      description: t.description,
      enabled: t.enabled,
      sort_order: t.sortOrder,
      exclusivity_mode: t.exclusivityMode,
      formation_rule: t.formationRule,
      requires_accept: t.requiresAccept,
      bidirectional_scoring: t.bidirectionalScoring,
      quantity_multiplies_points: t.quantityMultipliesPoints,
      levels_enabled: t.levelsEnabled,
      dm_gifts_count: t.dmGiftsCount,
      room_gifts_count: t.roomGiftsCount,
      visual: t.visual,
      leaderboard: t.leaderboard,
      rank1_rewards: t.rank1Rewards,
    };
  }

  private async mapRelationship(row: {
    id: string;
    userLowId: bigint;
    userHighId: bigint;
    initiatorId: bigint | null;
    status: string;
    totalScore: bigint;
    level: number | null;
    createdAt: Date;
    updatedAt: Date;
    relationshipType: {
      code: string;
      name: string;
      levelsEnabled: boolean;
      visual: unknown;
    };
  }) {
    const users = await this.prisma.user.findMany({
      where: { id: { in: [row.userLowId, row.userHighId] } },
      select: { id: true, name: true, avatarUrl: true },
    });
    const byId = new Map(users.map((u) => [u.id.toString(), u]));
    const brief = (id: bigint) => {
      const u = byId.get(id.toString());
      return {
        id: Number(id),
        name: u?.name ?? 'User',
        avatar_url: u?.avatarUrl ?? null,
      };
    };

    const allTime = await this.prisma.relationshipPeriodScore.findUnique({
      where: {
        relationshipId_periodType_periodKey_roomKey: {
          relationshipId: row.id,
          periodType: 'all_time',
          periodKey: periodKey('all_time'),
          roomKey: '',
        },
      },
    });

    return {
      id: row.id,
      type_code: row.relationshipType.code,
      type_name: row.relationshipType.name,
      status: row.status,
      total_score: Number(row.totalScore),
      level: row.relationshipType.levelsEnabled ? row.level : null,
      levels_enabled: row.relationshipType.levelsEnabled,
      visual: row.relationshipType.visual,
      users: [brief(row.userLowId), brief(row.userHighId)],
      initiator_id: row.initiatorId ? Number(row.initiatorId) : null,
      rank_global_all_time: allTime?.rank ?? null,
      is_rank1_global_all_time: allTime?.rank === 1,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }
}

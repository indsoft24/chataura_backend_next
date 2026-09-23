import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LedgerService } from '../wallet/ledger.service';
import { RelationshipEngineService } from './relationship-engine.service';
import {
  PeriodType,
  canonicalUserPair,
  isPeriodType,
  periodKey,
} from './relationship-period';
import { Prisma } from '@prisma/client';

@Injectable()
export class RelationshipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: RelationshipEngineService,
    @Inject(forwardRef(() => LedgerService))
    private readonly ledger: LedgerService,
  ) {}

  async listTypes(enabledOnly = true) {
    await this.engine.ensureDefaultTypes();
    const types = await this.prisma.relationshipType.findMany({
      where: enabledOnly ? { enabled: true } : undefined,
      include: { levelThresholds: { orderBy: { level: 'asc' } } },
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
        status: { in: ['active', 'pending'] },
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
    const pending = items.filter((i) => i.status === 'pending');
    const count = type
      ? await this.prisma.userRelationship.count({
          where: {
            relationshipTypeId: type.id,
            status: { in: ['active', 'pending'] },
            OR: [{ userLowId: userId }, { userHighId: userId }],
          },
        })
      : items.length;
    return {
      items,
      pending,
      count,
      max_partners: type?.maxPartners ?? null,
      formation_cost_coins: type?.formationCostCoins ?? 0,
      unbind_cost_coins: type?.unbindCostCoins ?? 0,
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
    max_partners?: number | null;
    formation_cost_coins?: number;
    unbind_cost_coins?: number;
    mic_exp_per_tick?: number;
    mic_exp_daily_cap?: number;
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
        maxPartners: body.max_partners ?? undefined,
        formationCostCoins: body.formation_cost_coins ?? 0,
        unbindCostCoins: body.unbind_cost_coins ?? 0,
        micExpPerTick: body.mic_exp_per_tick ?? 0,
        micExpDailyCap: body.mic_exp_daily_cap ?? 0,
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
        maxPartners: body.max_partners,
        formationCostCoins: body.formation_cost_coins,
        unbindCostCoins: body.unbind_cost_coins,
        micExpPerTick: body.mic_exp_per_tick,
        micExpDailyCap: body.mic_exp_daily_cap,
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

  fail(code: string, message: string): never {
    throw new BadRequestException({
      success: false,
      error: { code, message },
    });
  }

  async invite(userId: bigint, targetUserId: number | string, typeCode: string) {
    const type = await this.requireType(typeCode);
    const target = BigInt(targetUserId);
    if (target === userId) this.fail('INVALID_TARGET', 'Cannot invite yourself');

    const { userLowId, userHighId } = canonicalUserPair(userId, target);
    const existing = await this.prisma.userRelationship.findUnique({
      where: {
        relationshipTypeId_userLowId_userHighId: {
          relationshipTypeId: type.id,
          userLowId,
          userHighId,
        },
      },
    });
    if (existing && (existing.status === 'active' || existing.status === 'pending')) {
      this.fail('ALREADY_EXISTS', 'Relationship already exists');
    }

    const atCap = await this.engine.isAtPartnerCap(
      this.prisma,
      type,
      userId,
      target,
    );
    if (atCap) this.fail('AT_CAP', `Maximum ${type.maxPartners} ${type.name} partners`);

    const activateNow = !type.requiresAccept && type.formationCostCoins <= 0;
    const status = activateNow ? 'active' : 'pending';

    const row = await this.prisma.$transaction(async (tx) => {
      if (activateNow === false && type.requiresAccept === false && type.formationCostCoins > 0) {
        await this.debitOrThrow(
          tx,
          userId,
          type.formationCostCoins,
          `rel_form_${type.code}_${userLowId}_${userHighId}`,
          `${type.name} formation`,
        );
      }
      if (existing) {
        return tx.userRelationship.update({
          where: { id: existing.id },
          data: {
            status,
            initiatorId: userId,
            totalScore: 0,
            level: type.levelsEnabled ? 1 : null,
          },
          include: { relationshipType: true },
        });
      }
      return tx.userRelationship.create({
        data: {
          relationshipTypeId: type.id,
          userLowId,
          userHighId,
          initiatorId: userId,
          status,
          totalScore: 0,
          level: type.levelsEnabled ? 1 : null,
        },
        include: { relationshipType: true },
      });
    });
    return this.mapRelationship(row);
  }

  async accept(userId: bigint, id: string) {
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
    if (row.status !== 'pending') this.fail('NOT_PENDING', 'Invite is not pending');
    const isMember = row.userLowId === userId || row.userHighId === userId;
    if (!isMember) throw new ForbiddenException({ success: false, error: { code: 'FORBIDDEN' } });
    if (row.initiatorId && row.initiatorId === userId) {
      this.fail('NOT_INVITEE', 'Wait for the other user to accept');
    }

    const payer = row.initiatorId ?? (row.userLowId === userId ? row.userHighId : row.userLowId);
    const updated = await this.prisma.$transaction(async (tx) => {
      if (row.relationshipType.formationCostCoins > 0) {
        await this.debitOrThrow(
          tx,
          payer,
          row.relationshipType.formationCostCoins,
          `rel_accept_${row.id}`,
          `${row.relationshipType.name} formation`,
        );
      }
      return tx.userRelationship.update({
        where: { id: row.id },
        data: { status: 'active' },
        include: { relationshipType: true },
      });
    });
    return this.mapRelationship(updated);
  }

  async unbind(userId: bigint, id: string) {
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
    const isMember = row.userLowId === userId || row.userHighId === userId;
    if (!isMember) throw new ForbiddenException({ success: false, error: { code: 'FORBIDDEN' } });
    if (row.status === 'ended') this.fail('ALREADY_ENDED', 'Already removed');

    const updated = await this.prisma.$transaction(async (tx) => {
      if (row.relationshipType.unbindCostCoins > 0 && row.status === 'active') {
        await this.debitOrThrow(
          tx,
          userId,
          row.relationshipType.unbindCostCoins,
          `rel_unbind_${row.id}_${userId}`,
          `${row.relationshipType.name} unbind`,
        );
      }
      return tx.userRelationship.update({
        where: { id: row.id },
        data: { status: 'ended', totalScore: 0, level: null },
        include: { relationshipType: true },
      });
    });
    return this.mapRelationship(updated);
  }

  private async debitOrThrow(
    tx: Prisma.TransactionClient,
    userId: bigint,
    amount: number,
    referenceId: string,
    title: string,
  ) {
    try {
      await this.ledger.debitCoins(tx, userId, amount, 'relationship', title, referenceId);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'INSUFFICIENT_BALANCE') {
        this.fail('INSUFFICIENT_BALANCE', 'Not enough coins');
      }
      throw e;
    }
  }

  async listRings(userId: bigint, typeCode?: string) {
    const type = typeCode ? await this.requireType(typeCode) : null;
    const defs = await this.prisma.relationshipRing.findMany({
      where: type ? { relationshipTypeId: type.id } : undefined,
      include: { relationshipType: true },
      orderBy: [{ sortOrder: 'asc' }, { minLevel: 'asc' }],
    });
    const owned = await this.prisma.userRelationshipRing.findMany({
      where: { userId, ringId: { in: defs.map((d) => d.id) } },
    });
    const ownedSet = new Set(owned.map((o) => o.ringId));
    return {
      items: defs.map((d) => ({
        id: d.id,
        code: d.code,
        name: d.name,
        min_level: d.minLevel,
        image_url: d.imageUrl,
        type_code: d.relationshipType.code,
        owned: ownedSet.has(d.id),
      })),
    };
  }

  async listPrivileges(userId: bigint, typeCode: string) {
    const type = await this.requireType(typeCode);
    const thresholds = await this.prisma.relationshipLevelThreshold.findMany({
      where: { relationshipTypeId: type.id },
      orderBy: { level: 'asc' },
    });
    const primary = await this.prisma.userRelationship.findFirst({
      where: {
        relationshipTypeId: type.id,
        status: 'active',
        OR: [{ userLowId: userId }, { userHighId: userId }],
      },
      orderBy: { totalScore: 'desc' },
    });
    const currentLevel = type.levelsEnabled ? primary?.level ?? 0 : 0;
    const catalog = thresholds.map((t) => {
      const rewards = (t.rewards ?? {}) as { privileges?: string[] };
      return {
        level: t.level,
        min_score: Number(t.minScore),
        privileges: rewards.privileges ?? [],
        unlocked: currentLevel >= t.level,
      };
    });
    return {
      type_code: type.code,
      current_level: currentLevel || null,
      total_score: primary ? Number(primary.totalScore) : 0,
      catalog,
    };
  }

  async broadcasts(opts: { roomId?: string; limit?: number }) {
    const take = Math.min(Math.max(opts.limit ?? 6, 1), 12);
    const types = await this.prisma.relationshipType.findMany({
      where: { enabled: true },
      orderBy: { sortOrder: 'asc' },
    });
    const items: Array<Record<string, unknown>> = [];
    for (const type of types) {
      const board = await this.leaderboard({
        type: type.code,
        period: 'daily',
        scope: opts.roomId ? 'room' : 'global',
        room_id: opts.roomId,
        limit: 3,
      });
      const rule = await this.prisma.relationshipGiftRule.findFirst({
        where: { relationshipTypeId: type.id, enabled: true },
        orderBy: { pointValue: 'asc' },
      });
      for (const row of board.items) {
        items.push({
          ...row,
          type_code: type.code,
          gift_id: rule ? Number(rule.giftId) : null,
          suggested_qty: 1,
        });
      }
    }
    items.sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0));
    return { items: items.slice(0, take) };
  }

  async micTick(roomId: string, seatedUserIds: Array<number | string>) {
    return this.prisma.$transaction((tx) =>
      this.engine.applyMicTick(tx, {
        roomId,
        seatedUserIds: seatedUserIds.map((id) => BigInt(id)),
      }),
    );
  }

  private async requireType(typeCode: string) {
    const type = await this.prisma.relationshipType.findFirst({
      where: { code: typeCode.trim().toLowerCase(), enabled: true },
    });
    if (!type) {
      throw new NotFoundException({
        success: false,
        error: { code: 'TYPE_NOT_FOUND', message: 'Relationship type not found' },
      });
    }
    return type;
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
    maxPartners?: number | null;
    formationCostCoins?: number;
    unbindCostCoins?: number;
    micExpPerTick?: number;
    micExpDailyCap?: number;
    levelThresholds?: Array<{
      level: number;
      minScore: bigint;
      rewards: unknown;
    }>;
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
      max_partners: t.maxPartners ?? null,
      formation_cost_coins: t.formationCostCoins ?? 0,
      unbind_cost_coins: t.unbindCostCoins ?? 0,
      mic_exp_per_tick: t.micExpPerTick ?? 0,
      mic_exp_daily_cap: t.micExpDailyCap ?? 0,
      visual: t.visual,
      leaderboard: t.leaderboard,
      rank1_rewards: t.rank1Rewards,
      levels: (t.levelThresholds ?? []).map((th) => ({
        level: th.level,
        min_score: Number(th.minScore),
        rewards: th.rewards,
      })),
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

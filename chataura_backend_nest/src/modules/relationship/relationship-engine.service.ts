import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  PERIOD_TYPES,
  canonicalUserPair,
  periodKey,
} from './relationship-period';

export type GiftSource = 'room' | 'dm';

export type ApplyGiftInput = {
  senderId: bigint;
  receiverId: bigint;
  giftId: bigint;
  giftCategory: string;
  giftCoinCost: number;
  quantity: number;
  /** Ledger / coin_transactions referenceId — idempotency key */
  giftTransactionId: string;
  source: GiftSource;
  roomId?: string | null;
};

export type RelationshipUserBrief = {
  id: number;
  name: string;
  avatar_url: string | null;
};

export type RelationshipApplyResult = {
  applied: boolean;
  created: boolean;
  contribution: number;
  relationship: null | {
    id: string;
    type_code: string;
    user_a: RelationshipUserBrief;
    user_b: RelationshipUserBrief;
    total_score: number;
    rank_global_all_time: number | null;
    rank_room_daily: number | null;
    is_rank1_global_all_time: boolean;
    levels_enabled: boolean;
    level: number | null;
  };
  visual_hints: {
    show_formed_ceremony: boolean;
    show_rank1_badge: boolean;
  };
  /** For Firestore CMD emitters (room gifts) */
  realtime?: {
    cmd: 'CREATED' | 'SCORE' | 'RANK1';
    type_code: string;
    relationship_id: string;
    user_a_id: number;
    user_b_id: number;
    score: number;
    contribution: number;
    transaction_id: string;
    became_rank1_global_all_time?: boolean;
  };
};

type Tx = Prisma.TransactionClient;

@Injectable()
export class RelationshipEngineService {
  constructor(private readonly prisma: PrismaService) {}

  async applyContribution(
    tx: Tx,
    input: ApplyGiftInput,
  ): Promise<RelationshipApplyResult> {
    const empty: RelationshipApplyResult = {
      applied: false,
      created: false,
      contribution: 0,
      relationship: null,
      visual_hints: {
        show_formed_ceremony: false,
        show_rank1_badge: false,
      },
    };

    if (input.senderId === input.receiverId) return empty;

    const quantity = Math.min(Math.max(Number(input.quantity || 1), 1), 100);
    const category = String(input.giftCategory ?? '')
      .trim()
      .toLowerCase();

    // Prefer explicit gift rule; else match enabled type by category code.
    let type = null as Awaited<
      ReturnType<Tx['relationshipType']['findFirst']>
    >;
    let pointValue = 0;

    const rule = await tx.relationshipGiftRule.findFirst({
      where: { giftId: input.giftId, enabled: true },
      include: { relationshipType: true },
    });

    if (rule?.relationshipType?.enabled) {
      type = rule.relationshipType;
      pointValue = rule.pointValue;
    } else if (category && category !== 'standard' && category !== 'customize') {
      type = await tx.relationshipType.findFirst({
        where: { code: category, enabled: true },
      });
      if (type) {
        pointValue = Math.max(0, Number(input.giftCoinCost) || 0);
      }
    }

    if (!type || pointValue <= 0) return empty;

    if (input.source === 'room' && !type.roomGiftsCount) return empty;
    if (input.source === 'dm' && !type.dmGiftsCount) return empty;

    // Idempotent: already applied this gift transaction
    const existingLedger = await tx.relationshipScoreLedger.findUnique({
      where: { giftTransactionId: input.giftTransactionId },
    });
    if (existingLedger) {
      const rel = await tx.userRelationship.findUnique({
        where: { id: existingLedger.relationshipId },
        include: { relationshipType: true },
      });
      if (!rel) return empty;
      return this.buildResult(tx, rel, type.code, type.levelsEnabled, {
        applied: true,
        created: false,
        contribution: Number(existingLedger.contribution),
        showFormed: false,
        becameRank1: false,
        giftTransactionId: input.giftTransactionId,
        roomId: input.roomId,
      });
    }

    const contribution = BigInt(
      type.quantityMultipliesPoints
        ? pointValue * quantity
        : pointValue,
    );

    const { userLowId, userHighId } = canonicalUserPair(
      input.senderId,
      input.receiverId,
    );

    let created = false;
    let rel = await tx.userRelationship.findUnique({
      where: {
        relationshipTypeId_userLowId_userHighId: {
          relationshipTypeId: type.id,
          userLowId,
          userHighId,
        },
      },
    });

    if (!rel) {
      created = true;
      rel = await tx.userRelationship.create({
        data: {
          relationshipTypeId: type.id,
          userLowId,
          userHighId,
          initiatorId: input.senderId,
          status: 'active',
          totalScore: contribution,
          level: type.levelsEnabled ? 1 : null,
        },
      });
    } else {
      rel = await tx.userRelationship.update({
        where: { id: rel.id },
        data: { totalScore: { increment: contribution } },
      });
    }

    await tx.relationshipScoreLedger.create({
      data: {
        relationshipId: rel.id,
        giftTransactionId: input.giftTransactionId,
        senderId: input.senderId,
        receiverId: input.receiverId,
        giftId: input.giftId,
        quantity,
        pointValue,
        contribution,
        source: input.source,
        roomId: input.roomId ?? null,
      },
    });

    const now = new Date();
    for (const period of PERIOD_TYPES) {
      const key = periodKey(period, now);
      // Global
      await this.bumpPeriodScore(tx, rel.id, period, key, '', contribution);
      // Room board
      if (input.roomId) {
        await this.bumpPeriodScore(
          tx,
          rel.id,
          period,
          key,
          input.roomId,
          contribution,
        );
      }
    }

    const becameRank1 = await this.refreshRankAndDetectRank1(
      tx,
      rel.id,
      'all_time',
      periodKey('all_time', now),
      '',
    );

    if (becameRank1) {
      await this.maybeGrantRank1Xp(tx, type.rank1Rewards, [
        input.senderId,
        input.receiverId,
      ]);
    }

    return this.buildResult(tx, rel, type.code, type.levelsEnabled, {
      applied: true,
      created,
      contribution: Number(contribution),
      showFormed: created,
      becameRank1,
      giftTransactionId: input.giftTransactionId,
      roomId: input.roomId,
    });
  }

  private async bumpPeriodScore(
    tx: Tx,
    relationshipId: string,
    periodType: string,
    periodKeyValue: string,
    roomKey: string,
    contribution: bigint,
  ) {
    await tx.relationshipPeriodScore.upsert({
      where: {
        relationshipId_periodType_periodKey_roomKey: {
          relationshipId,
          periodType,
          periodKey: periodKeyValue,
          roomKey,
        },
      },
      create: {
        relationshipId,
        periodType,
        periodKey: periodKeyValue,
        roomKey,
        score: contribution,
      },
      update: { score: { increment: contribution } },
    });
  }

  /** Recompute ranks for a board; return true if this rel became #1. */
  private async refreshRankAndDetectRank1(
    tx: Tx,
    relationshipId: string,
    periodType: string,
    periodKeyValue: string,
    roomKey: string,
  ): Promise<boolean> {
    const rows = await tx.relationshipPeriodScore.findMany({
      where: { periodType, periodKey: periodKeyValue, roomKey },
      orderBy: [{ score: 'desc' }, { relationshipId: 'asc' }],
      select: { id: true, relationshipId: true, rank: true },
    });

    let becameRank1 = false;
    for (let i = 0; i < rows.length; i++) {
      const newRank = i + 1;
      const row = rows[i];
      if (row.rank !== newRank) {
        await tx.relationshipPeriodScore.update({
          where: { id: row.id },
          data: { rank: newRank },
        });
      }
      if (
        row.relationshipId === relationshipId &&
        newRank === 1 &&
        row.rank !== 1
      ) {
        becameRank1 = true;
      }
    }
    return becameRank1;
  }

  private async maybeGrantRank1Xp(
    tx: Tx,
    rank1Rewards: unknown,
    userIds: bigint[],
  ) {
    const rewards = (rank1Rewards ?? {}) as { xp_bonus?: number };
    const xp = Math.max(0, Number(rewards.xp_bonus ?? 0));
    if (xp <= 0) return;
    for (const uid of userIds) {
      await tx.user.update({
        where: { id: uid },
        data: { xp: { increment: xp } },
      });
    }
  }

  private async buildResult(
    tx: Tx,
    rel: {
      id: string;
      userLowId: bigint;
      userHighId: bigint;
      totalScore: bigint;
      level: number | null;
    },
    typeCode: string,
    levelsEnabled: boolean,
    meta: {
      applied: boolean;
      created: boolean;
      contribution: number;
      showFormed: boolean;
      becameRank1: boolean;
      giftTransactionId: string;
      roomId?: string | null;
    },
  ): Promise<RelationshipApplyResult> {
    const users = await tx.user.findMany({
      where: { id: { in: [rel.userLowId, rel.userHighId] } },
      select: { id: true, name: true, avatarUrl: true },
    });
    const byId = new Map(users.map((u) => [u.id.toString(), u]));
    const toBrief = (id: bigint): RelationshipUserBrief => {
      const u = byId.get(id.toString());
      return {
        id: Number(id),
        name: u?.name ?? 'User',
        avatar_url: u?.avatarUrl ?? null,
      };
    };

    const allTimeKey = periodKey('all_time');
    const dailyKey = periodKey('daily');
    const globalAll = await tx.relationshipPeriodScore.findUnique({
      where: {
        relationshipId_periodType_periodKey_roomKey: {
          relationshipId: rel.id,
          periodType: 'all_time',
          periodKey: allTimeKey,
          roomKey: '',
        },
      },
    });
    let roomDailyRank: number | null = null;
    if (meta.roomId) {
      const rd = await tx.relationshipPeriodScore.findUnique({
        where: {
          relationshipId_periodType_periodKey_roomKey: {
            relationshipId: rel.id,
            periodType: 'daily',
            periodKey: dailyKey,
            roomKey: meta.roomId,
          },
        },
      });
      roomDailyRank = rd?.rank ?? null;
    }

    const rankGlobal = globalAll?.rank ?? null;
    const isRank1 = rankGlobal === 1;

    const cmd: 'CREATED' | 'SCORE' | 'RANK1' = meta.created
      ? 'CREATED'
      : meta.becameRank1
        ? 'RANK1'
        : 'SCORE';

    return {
      applied: meta.applied,
      created: meta.created,
      contribution: meta.contribution,
      relationship: {
        id: rel.id,
        type_code: typeCode,
        user_a: toBrief(rel.userLowId),
        user_b: toBrief(rel.userHighId),
        total_score: Number(rel.totalScore),
        rank_global_all_time: rankGlobal,
        rank_room_daily: roomDailyRank,
        is_rank1_global_all_time: isRank1,
        levels_enabled: levelsEnabled,
        level: levelsEnabled ? rel.level : null,
      },
      visual_hints: {
        show_formed_ceremony: meta.showFormed,
        show_rank1_badge: isRank1 || meta.becameRank1,
      },
      realtime: {
        cmd,
        type_code: typeCode,
        relationship_id: rel.id,
        user_a_id: Number(rel.userLowId),
        user_b_id: Number(rel.userHighId),
        score: Number(rel.totalScore),
        contribution: meta.contribution,
        transaction_id: meta.giftTransactionId,
        became_rank1_global_all_time: meta.becameRank1,
      },
    };
  }

  /** Seed / ensure CP + BCP types exist. */
  async ensureDefaultTypes(prisma: PrismaService | Tx = this.prisma) {
    const defaults = [
      {
        code: 'cp',
        name: 'CP',
        description: 'Couple relationship formed by qualifying CP gifts',
        sortOrder: 1,
        visual: {
          color_primary: '#FF4D8D',
          color_accent: '#F5C542',
          motif: 'twin_hearts',
        },
        leaderboard: {
          periods: ['daily', 'weekly', 'monthly', 'all_time'],
          scopes: ['global', 'room'],
        },
        rank1Rewards: { xp_bonus: 100, badge: true },
      },
      {
        code: 'bcp',
        name: 'BCP',
        description: 'Best Couple relationship formed by qualifying BCP gifts',
        sortOrder: 2,
        visual: {
          color_primary: '#00E5FF',
          color_accent: '#F5C542',
          motif: 'linked_stars',
        },
        leaderboard: {
          periods: ['daily', 'weekly', 'monthly', 'all_time'],
          scopes: ['global', 'room'],
        },
        rank1Rewards: { xp_bonus: 100, badge: true },
      },
    ];

    for (const d of defaults) {
      await (prisma as PrismaService).relationshipType.upsert({
        where: { code: d.code },
        create: {
          code: d.code,
          name: d.name,
          description: d.description,
          enabled: true,
          sortOrder: d.sortOrder,
          exclusivityMode: 'none',
          formationRule: 'first_qualifying_gift',
          requiresAccept: false,
          bidirectionalScoring: true,
          quantityMultipliesPoints: true,
          levelsEnabled: false,
          dmGiftsCount: true,
          roomGiftsCount: true,
          visual: d.visual,
          leaderboard: d.leaderboard,
          rank1Rewards: d.rank1Rewards,
        },
        update: {
          name: d.name,
          description: d.description,
          enabled: true,
        },
      });
    }
  }

  /** Sync gift rules from gift.category ∈ enabled type codes. */
  async syncGiftRulesFromCategories(prisma: PrismaService = this.prisma) {
    await this.ensureDefaultTypes(prisma);
    const types = await prisma.relationshipType.findMany({
      where: { enabled: true },
    });
    const byCode = new Map(types.map((t) => [t.code, t]));
    const gifts = await prisma.gift.findMany({
      where: { isActive: true },
    });
    for (const g of gifts) {
      const cat = String(g.category ?? '')
        .trim()
        .toLowerCase();
      const type = byCode.get(cat);
      if (!type) continue;
      await prisma.relationshipGiftRule.upsert({
        where: {
          giftId_relationshipTypeId: {
            giftId: g.id,
            relationshipTypeId: type.id,
          },
        },
        create: {
          giftId: g.id,
          relationshipTypeId: type.id,
          pointValue: g.coinCost,
          enabled: true,
        },
        update: {
          // Keep admin overrides: only fill if still matching coin cost? Prefer not overwrite pointValue.
          enabled: true,
        },
      });
    }
  }
}

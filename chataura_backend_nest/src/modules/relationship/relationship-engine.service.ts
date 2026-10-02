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

export type PartnerBlockReason = 'SENDER_HAS_PARTNER' | 'RECEIVER_HAS_PARTNER';

export type FormationProgress = {
  type_code: string;
  user_a_id: number;
  user_b_id: number;
  progress_coins: number;
  threshold_coins: number;
  remaining_coins: number;
  formed: boolean;
  blocked_reason: PartnerBlockReason | null;
  is_outbid_challenge?: boolean;
  outbid_target_score?: number;
  is_disconnect_progress?: boolean;
  disconnect_coins?: number;
  disconnect_threshold_coins?: number;
};

export type RelationshipApplyResult = {
  applied: boolean;
  created: boolean;
  contribution: number;
  /** Set while a gift-threshold pair is building, and on the gift that forms it. */
  formation_progress: FormationProgress | null;
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

type Tx = Prisma.TransactionClient | PrismaService;

export const DEFAULT_FORMATION_THRESHOLD_COINS = 3_000_000;
export const DEFAULT_UNBIND_COST_COINS = 3_000_000;

function defaultRulesText(name: string, micExp: boolean): string {
  return [
    `How to become ${name}?`,
    `1. Send ${name} gifts to each other. Gifts in both directions add up.`,
    `2. When the total reaches 2,000,000 coins you become ${name} automatically.`,
    `3. Each user can have only one ${name} at a time.`,
    '',
    `How to improve ${name} level?`,
    `1. Keep sending ${name} gifts: 1 coin = 1 intimacy point.`,
    ...(micExp
      ? ['2. On mic together in the same room, every 5 minutes = 120 Exp (maximum 12000 Exp per day).']
      : []),
    '',
    `How to remove ${name}?`,
    `1. On the ${name} page, tap Remove and confirm.`,
    '2. Removing costs 3,000,000 coins.',
    '3. After removing, level and progress are reset; you need to gift 2,000,000 again to re-form.',
  ].join('\n');
}

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
      formation_progress: null,
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

    // Strict requirement: normal / non-relationship gifts must NEVER trigger CP or BCP bonds
    const typeCodeLower = type.code.toLowerCase();
    if (typeCodeLower === 'cp' || typeCodeLower === 'bcp') {
      if (category !== typeCodeLower) {
        return empty;
      }
    }

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
      if (rel.status !== 'active') {
        return {
          ...empty,
          applied: true,
          contribution: Number(existingLedger.contribution),
          formation_progress: this.progressOf(type, rel, false, null),
        };
      }
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

    await this.lockPairUsers(tx, type.id, input.senderId, input.receiverId);

    let created = false;
    let formationProgress: FormationProgress | null = null;
    let rel = await tx.userRelationship.findUnique({
      where: {
        relationshipTypeId_userLowId_userHighId: {
          relationshipTypeId: type.id,
          userLowId,
          userHighId,
        },
      },
    });
    const threshold = BigInt(
      type.formationThresholdCoins && Number(type.formationThresholdCoins) > 0
        ? type.formationThresholdCoins
        : DEFAULT_FORMATION_THRESHOLD_COINS,
    );
    const giftCoins = BigInt(
      Math.max(0, Math.trunc(Number(input.giftCoinCost) || 0)) * quantity,
    );

    if (rel?.status === 'disconnect_pending') {
      const unbindThreshold = BigInt(type.unbindCostCoins || DEFAULT_UNBIND_COST_COINS);
      const newDisconnect = BigInt(rel.disconnectCoins ?? 0) + giftCoins;
      if (newDisconnect >= unbindThreshold) {
        rel = await tx.userRelationship.update({
          where: { id: rel.id },
          data: {
            status: 'ended',
            disconnectCoins: 0n,
            disconnectRequestedBy: null,
            totalScore: 0n,
            progressCoins: 0n,
            level: null,
          },
        });
        formationProgress = {
          type_code: type.code,
          user_a_id: Number(rel.userLowId),
          user_b_id: Number(rel.userHighId),
          progress_coins: Number(newDisconnect),
          threshold_coins: Number(unbindThreshold),
          remaining_coins: 0,
          formed: false,
          blocked_reason: null,
          is_disconnect_progress: true,
          disconnect_coins: Number(newDisconnect),
          disconnect_threshold_coins: Number(unbindThreshold),
        };
        await this.recordLedger(tx, rel.id, input, quantity, pointValue, contribution);
        return {
          ...empty,
          applied: true,
          contribution: Number(contribution),
          formation_progress: formationProgress,
          realtime: {
            cmd: 'SCORE',
            type_code: type.code,
            relationship_id: rel.id,
            user_a_id: Number(rel.userLowId),
            user_b_id: Number(rel.userHighId),
            score: 0,
            contribution: Number(contribution),
            transaction_id: input.giftTransactionId,
          },
        };
      } else {
        rel = await tx.userRelationship.update({
          where: { id: rel.id },
          data: {
            disconnectCoins: newDisconnect,
            totalScore: { increment: contribution },
          },
        });
        formationProgress = {
          type_code: type.code,
          user_a_id: Number(rel.userLowId),
          user_b_id: Number(rel.userHighId),
          progress_coins: Number(newDisconnect),
          threshold_coins: Number(unbindThreshold),
          remaining_coins: Math.max(0, Number(unbindThreshold - newDisconnect)),
          formed: false,
          blocked_reason: null,
          is_disconnect_progress: true,
          disconnect_coins: Number(newDisconnect),
          disconnect_threshold_coins: Number(unbindThreshold),
        };
        await this.recordLedger(tx, rel.id, input, quantity, pointValue, contribution);
        return {
          ...empty,
          applied: true,
          contribution: Number(contribution),
          formation_progress: formationProgress,
        };
      }
    } else if (rel?.status === 'active') {
      rel = await tx.userRelationship.update({
        where: { id: rel.id },
        data: { totalScore: { increment: contribution } },
      });
    } else if (threshold > 0n) {
      // Check if either partner currently has an active partner (third-party outbid/dethroning challenge)
      const existingSenderRel = await tx.userRelationship.findFirst({
        where: {
          relationshipTypeId: type.id,
          status: { in: ['active', 'disconnect_pending'] },
          OR: [{ userLowId: input.senderId }, { userHighId: input.senderId }],
          ...(rel?.id ? { id: { not: rel.id } } : {}),
        },
      });

      const existingReceiverRel = await tx.userRelationship.findFirst({
        where: {
          relationshipTypeId: type.id,
          status: { in: ['active', 'disconnect_pending'] },
          OR: [{ userLowId: input.receiverId }, { userHighId: input.receiverId }],
          ...(rel?.id ? { id: { not: rel.id } } : {}),
        },
      });

      const isOutbidChallenge = Boolean(existingSenderRel || existingReceiverRel);
      const scoreSender = existingSenderRel ? Number(existingSenderRel.totalScore) : 0;
      const scoreReceiver = existingReceiverRel ? Number(existingReceiverRel.totalScore) : 0;
      const maxExistingScore = Math.max(scoreSender, scoreReceiver);
      const baseThreshold = Number(threshold > 0n ? threshold : BigInt(DEFAULT_FORMATION_THRESHOLD_COINS));
      const effectiveThreshold = BigInt(isOutbidChallenge ? Math.max(baseThreshold, maxExistingScore + 1) : baseThreshold);

      const restart = !rel || rel.status === 'ended';
      const progress = (restart ? 0n : rel!.progressCoins) + giftCoins;
      const score = (restart ? 0n : rel!.totalScore) + contribution;
      const forms = progress >= effectiveThreshold;

      if (forms) {
        if (existingSenderRel) {
          await tx.userRelationship.update({
            where: { id: existingSenderRel.id },
            data: { status: 'ended', totalScore: 0n, progressCoins: 0n, level: null },
          });
        }
        if (existingReceiverRel && existingReceiverRel.id !== existingSenderRel?.id) {
          await tx.userRelationship.update({
            where: { id: existingReceiverRel.id },
            data: { status: 'ended', totalScore: 0n, progressCoins: 0n, level: null },
          });
        }
      }

      const data = {
        status: forms ? 'active' : 'building',
        progressCoins: progress,
        totalScore: score,
        level: forms && type.levelsEnabled ? 1 : null,
        ...(restart || forms ? { initiatorId: input.senderId } : {}),
      };
      rel = rel
        ? await tx.userRelationship.update({ where: { id: rel.id }, data })
        : await tx.userRelationship.create({
            data: {
              relationshipTypeId: type.id,
              userLowId,
              userHighId,
              ...data,
            },
          });
      formationProgress = {
        type_code: type.code,
        user_a_id: Number(rel.userLowId),
        user_b_id: Number(rel.userHighId),
        progress_coins: Number(progress),
        threshold_coins: Number(effectiveThreshold),
        remaining_coins: Math.max(0, Number(effectiveThreshold - progress)),
        formed: forms,
        blocked_reason: null,
        is_outbid_challenge: isOutbidChallenge,
        outbid_target_score: maxExistingScore,
      };

      if (!forms) {
        await this.recordLedger(tx, rel.id, input, quantity, pointValue, contribution);
        return {
          ...empty,
          applied: true,
          contribution: Number(contribution),
          formation_progress: formationProgress,
        };
      }
      created = true;
    } else if (!rel) {
      const atCap = await this.isAtPartnerCap(
        tx,
        type,
        input.senderId,
        input.receiverId,
      );
      if (atCap) return empty;
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
    } else if (rel.status === 'ended') {
      created = true;
      rel = await tx.userRelationship.update({
        where: { id: rel.id },
        data: {
          status: 'active',
          initiatorId: input.senderId,
          totalScore: contribution,
          level: type.levelsEnabled ? 1 : null,
        },
      });
    } else if (rel.status === 'pending') {
      created = true;
      rel = await tx.userRelationship.update({
        where: { id: rel.id },
        data: {
          status: 'active',
          totalScore: { increment: contribution },
        },
      });
    } else {
      // 'building' left over after the type's threshold was set back to 0.
      const atCap = await this.isAtPartnerCap(
        tx,
        type,
        input.senderId,
        input.receiverId,
        rel.id,
      );
      if (atCap) return empty;
      created = true;
      rel = await tx.userRelationship.update({
        where: { id: rel.id },
        data: {
          status: 'active',
          totalScore: { increment: contribution },
          level: type.levelsEnabled ? 1 : null,
        },
      });
    }

    await this.recordLedger(tx, rel.id, input, quantity, pointValue, contribution);

    // Gifts sent while building count towards the boards on the forming gift.
    const boardContribution = formationProgress?.formed
      ? rel.totalScore
      : contribution;

    rel = await this.refreshLevelAndRings(tx, rel.id, type.id);

    const now = new Date();
    for (const period of PERIOD_TYPES) {
      const key = periodKey(period, now);
      // Global
      await this.bumpPeriodScore(tx, rel.id, period, key, '', boardContribution);
      // Room board
      if (input.roomId) {
        await this.bumpPeriodScore(
          tx,
          rel.id,
          period,
          key,
          input.roomId,
          boardContribution,
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
      formationProgress,
    });
  }

  private async recordLedger(
    tx: Tx,
    relationshipId: string,
    input: ApplyGiftInput,
    quantity: number,
    pointValue: number,
    contribution: bigint,
  ) {
    await tx.relationshipScoreLedger.create({
      data: {
        relationshipId,
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
  }

  progressOf(
    type: { code: string; formationThresholdCoins: bigint },
    rel: {
      userLowId: bigint;
      userHighId: bigint;
      progressCoins: bigint;
      status: string;
    },
    formed: boolean,
    blocked: PartnerBlockReason | null,
  ): FormationProgress {
    const threshold = Number(type.formationThresholdCoins ?? 0);
    const progress = rel.status === 'ended' ? 0 : Number(rel.progressCoins);
    return {
      type_code: type.code,
      user_a_id: Number(rel.userLowId),
      user_b_id: Number(rel.userHighId),
      progress_coins: progress,
      threshold_coins: threshold,
      remaining_coins: Math.max(threshold - progress, 0),
      formed,
      blocked_reason: blocked,
    };
  }

  /**
   * Serialises partner-cap checks per (type, user) for the rest of the
   * transaction, so two pairs sharing a user cannot both form concurrently.
   */
  async lockPairUsers(tx: Tx, typeId: string, a: bigint, b: bigint) {
    const ids = a < b ? [a, b] : [b, a];
    for (const id of ids) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`rel:${typeId}:${id}`}, 0))`;
    }
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
      formationProgress?: FormationProgress | null;
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
      formation_progress: meta.formationProgress ?? null,
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

  async isAtPartnerCap(
    tx: Tx,
    type: { id: string; maxPartners: number | null },
    userA: bigint,
    userB: bigint,
    excludeRelationshipId?: string,
  ): Promise<boolean> {
    return (
      (await this.partnerBlock(tx, type, userA, userB, excludeRelationshipId)) !==
      null
    );
  }

  /** Which side (first arg = sender) already has the maximum partners of this type. */
  async partnerBlock(
    tx: Tx,
    type: { id: string; maxPartners: number | null },
    senderId: bigint,
    receiverId: bigint,
    excludeRelationshipId?: string,
  ): Promise<PartnerBlockReason | null> {
    const cap = type.maxPartners;
    if (!cap || cap <= 0) return null;
    const sides: [bigint, PartnerBlockReason][] = [
      [senderId, 'SENDER_HAS_PARTNER'],
      [receiverId, 'RECEIVER_HAS_PARTNER'],
    ];
    for (const [uid, reason] of sides) {
      const n = await tx.userRelationship.count({
        where: {
          relationshipTypeId: type.id,
          status: { in: ['active', 'pending'] },
          OR: [{ userLowId: uid }, { userHighId: uid }],
          ...(excludeRelationshipId ? { id: { not: excludeRelationshipId } } : {}),
        },
      });
      if (n >= cap) return reason;
    }
    return null;
  }

  async refreshLevelAndRings(tx: Tx, relationshipId: string, typeId: string) {
    const rel = await tx.userRelationship.findUniqueOrThrow({
      where: { id: relationshipId },
    });
    const type = await tx.relationshipType.findUniqueOrThrow({
      where: { id: typeId },
    });
    if (!type.levelsEnabled) return rel;

    const thresholds = await tx.relationshipLevelThreshold.findMany({
      where: { relationshipTypeId: typeId },
      orderBy: { level: 'asc' },
    });
    let level = 1;
    for (const t of thresholds) {
      if (rel.totalScore >= t.minScore) level = t.level;
    }
    const updated =
      rel.level === level
        ? rel
        : await tx.userRelationship.update({
            where: { id: rel.id },
            data: { level },
          });

    const rings = await tx.relationshipRing.findMany({
      where: { relationshipTypeId: typeId, minLevel: { lte: level } },
    });
    for (const ring of rings) {
      for (const uid of [rel.userLowId, rel.userHighId]) {
        await tx.userRelationshipRing.upsert({
          where: { userId_ringId: { userId: uid, ringId: ring.id } },
          create: {
            userId: uid,
            ringId: ring.id,
            relationshipId: rel.id,
          },
          update: {},
        });
      }
    }
    return updated;
  }

  async applyMicTick(
    tx: Tx,
    input: { roomId: string; seatedUserIds: bigint[] },
  ): Promise<{ applied: number }> {
    const seated = Array.from(new Set(input.seatedUserIds));
    if (seated.length < 2) return { applied: 0 };

    const types = await tx.relationshipType.findMany({
      where: { enabled: true, micExpPerTick: { gt: 0 } },
    });
    if (!types.length) return { applied: 0 };

    let applied = 0;
    const now = new Date();
    for (const type of types) {
      const pairs = await tx.userRelationship.findMany({
        where: {
          relationshipTypeId: type.id,
          status: 'active',
          userLowId: { in: seated },
          userHighId: { in: seated },
        },
      });
      for (const rel of pairs) {
        const tick = BigInt(type.micExpPerTick);
        const dayStart = new Date(now);
        dayStart.setUTCHours(0, 0, 0, 0);
        const todayMic = await tx.relationshipScoreLedger.aggregate({
          where: {
            relationshipId: rel.id,
            source: 'mic',
            createdAt: { gte: dayStart },
          },
          _sum: { contribution: true },
        });
        const already = Number(todayMic._sum.contribution ?? 0);
        if (type.micExpDailyCap > 0 && already >= type.micExpDailyCap) continue;

        const last = await tx.relationshipScoreLedger.findFirst({
          where: { relationshipId: rel.id, source: 'mic' },
          orderBy: { createdAt: 'desc' },
        });
        if (last && now.getTime() - last.createdAt.getTime() < 5 * 60 * 1000) {
          continue;
        }

        const remaining =
          type.micExpDailyCap > 0
            ? Math.max(type.micExpDailyCap - already, 0)
            : Number(tick);
        const contribution = BigInt(Math.min(Number(tick), remaining));
        if (contribution <= 0n) continue;

        const txId = `mic:${rel.id}:${Math.floor(now.getTime() / (5 * 60 * 1000))}`;
        const existing = await tx.relationshipScoreLedger.findUnique({
          where: { giftTransactionId: txId },
        });
        if (existing) continue;

        await tx.userRelationship.update({
          where: { id: rel.id },
          data: { totalScore: { increment: contribution } },
        });
        await tx.relationshipScoreLedger.create({
          data: {
            relationshipId: rel.id,
            giftTransactionId: txId,
            senderId: rel.userLowId,
            receiverId: rel.userHighId,
            giftId: null,
            quantity: 1,
            pointValue: Number(contribution),
            contribution,
            source: 'mic',
            roomId: input.roomId,
          },
        });
        for (const period of PERIOD_TYPES) {
          const key = periodKey(period, now);
          await this.bumpPeriodScore(tx, rel.id, period, key, '', contribution);
          await this.bumpPeriodScore(
            tx,
            rel.id,
            period,
            key,
            input.roomId,
            contribution,
          );
        }
        await this.refreshLevelAndRings(tx, rel.id, type.id);
        applied += 1;
      }
    }
    return { applied };
  }

  /** Seed / ensure CP + BCP types exist. */
  async ensureDefaultTypes(prisma: PrismaService | Tx = this.prisma) {
    const db = prisma as PrismaService;
    const defaults = [
      {
        code: 'cp',
        name: 'CP',
        description: 'Couple relationship formed by cumulative CP gifting',
        sortOrder: 1,
        maxPartners: 1 as number | null,
        formationCostCoins: 0,
        formationThresholdCoins: DEFAULT_FORMATION_THRESHOLD_COINS,
        unbindCostCoins: DEFAULT_UNBIND_COST_COINS,
        micExpPerTick: 0,
        micExpDailyCap: 0,
        requiresAccept: false,
        visual: {
          color_primary: '#FF4D8D',
          color_accent: '#F5C542',
          motif: 'twin_hearts',
          hub_label: 'CP',
          hub_tabs: ['home', 'privileges', 'rings'],
          rules: defaultRulesText('CP', false),
        },
        leaderboard: {
          periods: ['daily', 'weekly', 'monthly', 'all_time'],
          scopes: ['global', 'room'],
        },
        rank1Rewards: { xp_bonus: 100, badge: true },
        thresholds: [
          { level: 1, minScore: 0, rewards: { privileges: ['room_emoji'] } },
          { level: 2, minScore: 10000, rewards: { privileges: ['room_profile'] } },
          { level: 3, minScore: 50000, rewards: { privileges: ['personal_profile'] } },
          { level: 4, minScore: 150000, rewards: { privileges: ['broadcast'] } },
          { level: 5, minScore: 400000, rewards: { privileges: ['ring'], ring_code: 'cp_lv5' } },
          { level: 6, minScore: 1000000, rewards: { privileges: ['ring'], ring_code: 'cp_lv6' } },
        ],
        rings: [
          { code: 'cp_lv5', name: 'CP Ring Lv.5', minLevel: 5, sortOrder: 1 },
          { code: 'cp_lv6', name: 'CP Ring Lv.6', minLevel: 6, sortOrder: 2 },
        ],
      },
      {
        code: 'bcp',
        name: 'BCP',
        description: 'BCP relationship formed by cumulative BCP gifting',
        sortOrder: 2,
        maxPartners: 1 as number | null,
        formationCostCoins: 0,
        formationThresholdCoins: DEFAULT_FORMATION_THRESHOLD_COINS,
        unbindCostCoins: DEFAULT_UNBIND_COST_COINS,
        micExpPerTick: 120,
        micExpDailyCap: 12000,
        requiresAccept: false,
        visual: {
          color_primary: '#7C4DFF',
          color_accent: '#F5C542',
          motif: 'golden_hands',
          hub_label: 'BCP',
          hub_tabs: ['home', 'privileges', 'rules'],
          rules: defaultRulesText('BCP', true),
        },
        leaderboard: {
          periods: ['daily', 'weekly', 'monthly', 'all_time'],
          scopes: ['global', 'room'],
        },
        rank1Rewards: { xp_bonus: 100, badge: true },
        thresholds: [
          { level: 1, minScore: 0, rewards: { privileges: ['broadcast'] } },
          { level: 2, minScore: 10000, rewards: { privileges: ['background'] } },
          { level: 3, minScore: 50000, rewards: { privileges: ['gift'] } },
          { level: 4, minScore: 150000, rewards: { privileges: ['room_emoji'] } },
          { level: 5, minScore: 400000, rewards: { privileges: ['room_profile'] } },
          { level: 6, minScore: 1000000, rewards: { privileges: ['personal_profile'] } },
        ],
        rings: [] as { code: string; name: string; minLevel: number; sortOrder: number }[],
      },
    ];

    for (const d of defaults) {
      const row = await db.relationshipType.upsert({
        where: { code: d.code },
        create: {
          code: d.code,
          name: d.name,
          description: d.description,
          enabled: true,
          sortOrder: d.sortOrder,
          exclusivityMode: 'none',
          formationRule: 'gift_threshold',
          requiresAccept: d.requiresAccept,
          bidirectionalScoring: true,
          quantityMultipliesPoints: true,
          levelsEnabled: true,
          dmGiftsCount: true,
          roomGiftsCount: true,
          maxPartners: d.maxPartners,
          formationCostCoins: d.formationCostCoins,
          formationThresholdCoins: BigInt(d.formationThresholdCoins),
          unbindCostCoins: d.unbindCostCoins,
          micExpPerTick: d.micExpPerTick,
          micExpDailyCap: d.micExpDailyCap,
          visual: d.visual,
          leaderboard: d.leaderboard,
          rank1Rewards: d.rank1Rewards,
        },
        // Existing types keep their admin-edited settings.
        update: {},
      });

      for (const th of d.thresholds) {
        await db.relationshipLevelThreshold.upsert({
          where: {
            relationshipTypeId_level: {
              relationshipTypeId: row.id,
              level: th.level,
            },
          },
          create: {
            relationshipTypeId: row.id,
            level: th.level,
            minScore: BigInt(th.minScore),
            rewards: th.rewards,
          },
          update: {
            minScore: BigInt(th.minScore),
            rewards: th.rewards,
          },
        });
      }
      for (const ring of d.rings) {
        await db.relationshipRing.upsert({
          where: {
            relationshipTypeId_code: {
              relationshipTypeId: row.id,
              code: ring.code,
            },
          },
          create: {
            relationshipTypeId: row.id,
            code: ring.code,
            name: ring.name,
            minLevel: ring.minLevel,
            sortOrder: ring.sortOrder,
          },
          update: {
            name: ring.name,
            minLevel: ring.minLevel,
            sortOrder: ring.sortOrder,
          },
        });
      }
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

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LedgerService } from '../wallet/ledger.service';

type Tx = Prisma.TransactionClient;

const HEARTBEAT_CAP_SECONDS = 30;

const CLOSE_REASONS = new Set([
  'leave',
  'kick',
  'stale_heartbeat',
  'room_ended',
  'admin_suspended',
]);

export type PartyBonus = {
  tier_id: number;
  duration_minutes: number;
  coins: number;
  gems: number;
};

@Injectable()
export class PresenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  async open(tx: Tx, userId: bigint, roomId: string) {
    const existing = await tx.userRoomPresenceSession.findFirst({
      where: { userId, roomId, isActive: true },
    });
    if (existing) return existing;
    return tx.userRoomPresenceSession.create({
      data: {
        userId,
        roomId,
        lastHeartbeatAt: new Date(),
        accumulatedSeconds: 0,
        isActive: true,
      },
    });
  }

  async heartbeat(userId: bigint, roomId: string) {
    return this.prisma.$transaction(async (tx) => {
      const session = await this.touch(tx, userId, roomId);
      const bonus_earned = await this.evaluateTiers(
        tx,
        userId,
        session.accumulatedSeconds,
        roomId,
      );
      return {
        bonus_earned,
        accumulated_seconds: session.accumulatedSeconds,
      };
    });
  }

  async close(
    tx: Tx,
    userId: bigint,
    roomId: string,
    reason: string,
  ): Promise<PartyBonus[]> {
    const session = await tx.userRoomPresenceSession.findFirst({
      where: { userId, roomId, isActive: true },
    });
    if (!session) return [];
    const now = new Date();
    const added = this.delta(session.lastHeartbeatAt, now);
    const accumulated = session.accumulatedSeconds + added;
    const bonus_earned = await this.evaluateTiers(
      tx,
      userId,
      accumulated,
      roomId,
    );
    await tx.userRoomPresenceSession.update({
      where: { id: session.id },
      data: {
        accumulatedSeconds: accumulated,
        lastHeartbeatAt: now,
        isActive: false,
        closedAt: now,
        closeReason: this.reason(reason),
        finalSeconds: accumulated,
      },
    });
    return bonus_earned;
  }

  async closeAll(tx: Tx, roomId: string, reason: string) {
    const sessions = await tx.userRoomPresenceSession.findMany({
      where: { roomId, isActive: true },
    });
    for (const session of sessions) {
      await this.close(tx, session.userId, roomId, reason);
    }
  }

  async closeActive(userId: bigint, roomId: string, reason: string) {
    return this.prisma.$transaction((tx) =>
      this.close(tx, userId, roomId, reason),
    );
  }

  private async touch(tx: Tx, userId: bigint, roomId: string) {
    const now = new Date();
    const existing = await tx.userRoomPresenceSession.findFirst({
      where: { userId, roomId, isActive: true },
    });
    if (!existing) {
      return tx.userRoomPresenceSession.create({
        data: {
          userId,
          roomId,
          lastHeartbeatAt: now,
          accumulatedSeconds: 0,
          isActive: true,
        },
      });
    }
    const accumulated =
      existing.accumulatedSeconds + this.delta(existing.lastHeartbeatAt, now);
    return tx.userRoomPresenceSession.update({
      where: { id: existing.id },
      data: { accumulatedSeconds: accumulated, lastHeartbeatAt: now },
    });
  }

  private async evaluateTiers(
    tx: Tx,
    userId: bigint,
    accumulatedSeconds: number,
    roomId: string,
  ): Promise<PartyBonus[]> {
    const tiers = await tx.partyRoomBonusTier.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { durationMinutes: 'asc' }],
    });
    const day = new Date().toISOString().slice(0, 10);
    const start = new Date(`${day}T00:00:00.000Z`);
    const claimed = await tx.bonusClaim.findMany({
      where: { userId, kind: 'party_tier', createdAt: { gte: start } },
    });
    const claimedIds = new Set(
      claimed.map((c) => {
        const meta = c.meta as { tier_id?: number } | null;
        return meta?.tier_id;
      }),
    );
    const earned: PartyBonus[] = [];
    for (const tier of tiers) {
      const tierId = Number(tier.id);
      if (claimedIds.has(tierId)) continue;
      if (accumulatedSeconds < tier.durationMinutes * 60) continue;
      const referenceKey = `party_tier_${tierId}_${day}`;
      const coins = tier.rewardType === 'gems' ? 0 : tier.coins;
      const gems = tier.rewardType === 'gems' ? tier.gems : 0;
      try {
        await tx.bonusClaim.create({
          data: {
            userId,
            kind: 'party_tier',
            coins,
            referenceKey,
            meta: {
              source: 'party_room',
              tier_id: tierId,
              room_id: roomId,
              duration_minutes: tier.durationMinutes,
              gems,
            },
          },
        });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          continue;
        }
        throw e;
      }
      if (coins > 0) {
        await this.ledger.creditCoins(
          tx,
          userId,
          coins,
          'PARTY_TIER',
          `Party room ${tier.durationMinutes}m`,
          referenceKey,
          null,
          {
            source: 'party_room',
            currency: 'coins',
            tier_id: tierId,
            room_id: roomId,
          },
        );
      }
      if (gems > 0) {
        const locked = await this.ledger.lockUser(tx, userId);
        const after = BigInt(locked?.gems ?? 0) + BigInt(gems);
        await tx.user.update({
          where: { id: userId },
          data: { gems: { increment: gems } },
        });
        await this.ledger.writeLedger(tx, {
          userId,
          type: 'PARTY_GEMS',
          title: `Party room ${tier.durationMinutes}m gems`,
          coinAmount: 0,
          balanceAfter: after,
          referenceId: `${referenceKey}_gems`,
          meta: {
            source: 'party_room',
            currency: 'gems',
            gems_delta: gems,
            tier_id: tierId,
            room_id: roomId,
          },
        });
      }
      earned.push({
        tier_id: tierId,
        duration_minutes: tier.durationMinutes,
        coins,
        gems,
      });
    }
    return earned;
  }

  private delta(last: Date | null, now: Date) {
    if (!last) return HEARTBEAT_CAP_SECONDS;
    const raw = Math.floor((now.getTime() - last.getTime()) / 1000);
    return Math.max(0, Math.min(HEARTBEAT_CAP_SECONDS, raw));
  }

  private reason(reason: string) {
    return CLOSE_REASONS.has(reason) ? reason : 'leave';
  }
}

import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ensureLaravelLevelBands } from '../gamification/level-bands';

type Tx = Prisma.TransactionClient | PrismaClient;

export interface LockedUser {
  id: bigint;
  wallet_balance: bigint;
  coin_balance: bigint;
  gems: bigint;
  referral_balance: bigint;
  inr_earnings_balance: bigint;
  usd_earnings_balance: bigint;
  xp: number | bigint;
  level: number;
  role: string;
  streak_count: number;
  last_streak_at: Date | null;
}

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async lockUser(tx: Tx, userId: bigint): Promise<LockedUser | null> {
    const rows = await tx.$queryRaw<LockedUser[]>`
      SELECT id, wallet_balance, coin_balance, gems, referral_balance,
             inr_earnings_balance, usd_earnings_balance, xp, level, role,
             streak_count, last_streak_at
      FROM users WHERE id = ${userId} FOR UPDATE`;
    return rows[0] ?? null;
  }

  /**
   * Lock multiple user rows in deterministic ascending ID order to prevent deadlocks.
   * Returns a Map<string, LockedUser> keyed by userId string.
   */
  async lockUsers(tx: Tx, userIds: (bigint | number)[]) {
    const sortedIds = Array.from(
      new Set(userIds.map((id) => BigInt(id))),
    ).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    const map = new Map<string, LockedUser>();
    for (const id of sortedIds) {
      const locked = await this.lockUser(tx, id);
      if (!locked) {
        throw Object.assign(new Error(`USER_NOT_FOUND: ${id}`), {
          code: 'USER_NOT_FOUND',
          userId: id,
        });
      }
      map.set(id.toString(), locked);
    }
    return map;
  }

  async writeLedger(
    tx: Tx,
    params: {
      userId: bigint;
      type: string;
      title?: string;
      coinAmount: bigint | number;
      netAmount?: bigint | number;
      commissionAmount?: bigint | number;
      balanceAfter?: bigint | number;
      referenceId?: string;
      status?: string;
      meta?: Prisma.InputJsonValue;
    },
  ) {
    return tx.coinTransaction.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title ?? null,
        coinAmount: BigInt(params.coinAmount),
        netAmount:
          params.netAmount !== undefined ? BigInt(params.netAmount) : null,
        commissionAmount:
          params.commissionAmount !== undefined
            ? BigInt(params.commissionAmount)
            : null,
        balanceAfter:
          params.balanceAfter !== undefined
            ? BigInt(params.balanceAfter)
            : null,
        referenceId: params.referenceId ?? null,
        status: params.status ?? 'success',
        meta: params.meta,
      },
    });
  }

  /** Credit spendable coins (wallet_balance + coin_balance twin). */
  async creditCoins(
    tx: Tx,
    userId: bigint,
    amount: bigint | number,
    type: string,
    title: string,
    referenceId?: string,
    existingLock?: LockedUser | null,
    meta?: Prisma.InputJsonValue,
  ) {
    const amt = BigInt(amount);
    if (amt <= 0n) throw new Error('credit amount must be positive');
    const prior = await this.findByReference(tx, userId, referenceId);
    if (prior) {
      return prior.balanceAfter ?? existingLock?.wallet_balance ?? 0n;
    }
    const locked = existingLock ?? (await this.lockUser(tx, userId));
    if (!locked) throw new Error('USER_NOT_FOUND');
    const after = BigInt(locked.wallet_balance) + amt;
    await tx.user.update({
      where: { id: userId },
      data: {
        walletBalance: { increment: amt },
        coinBalance: { increment: amt },
      },
    });
    await this.writeLedger(tx, {
      userId,
      type,
      title,
      coinAmount: amt,
      balanceAfter: after,
      referenceId,
      meta,
    });
    return after;
  }

  /** Debit spendable coins with FOR UPDATE guard. */
  async debitCoins(
    tx: Tx,
    userId: bigint,
    amount: bigint | number,
    type: string,
    title: string,
    referenceId?: string,
    existingLock?: LockedUser | null,
    meta?: Prisma.InputJsonValue,
    xpSource?: string,
  ): Promise<{ after: bigint; locked: LockedUser; replayed: boolean }> {
    const amt = BigInt(amount);
    if (amt <= 0n) throw new Error('debit amount must be positive');
    const prior = await this.findByReference(tx, userId, referenceId);
    if (prior) {
      const locked = existingLock ?? (await this.lockUser(tx, userId));
      if (!locked) throw new Error('USER_NOT_FOUND');
      return {
        after: prior.balanceAfter ?? BigInt(locked.wallet_balance),
        locked,
        replayed: true,
      };
    }
    const locked = existingLock ?? (await this.lockUser(tx, userId));
    if (!locked) throw new Error('USER_NOT_FOUND');
    const wallet = BigInt(locked.wallet_balance);
    const after = wallet - amt;
    if (wallet < amt || after < 0n) {
      throw Object.assign(new Error('INSUFFICIENT_BALANCE'), {
        code: 'INSUFFICIENT_BALANCE',
      });
    }
    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: {
        walletBalance: { decrement: amt },
        coinBalance: { decrement: amt },
      },
    });
    if (updatedUser.walletBalance < 0n) {
      throw Object.assign(new Error('INSUFFICIENT_BALANCE'), {
        code: 'INSUFFICIENT_BALANCE',
      });
    }
    const ledgerMeta = this.withSource(meta, xpSource);
    await this.writeLedger(tx, {
      userId,
      type,
      title,
      coinAmount: -amt,
      balanceAfter: after,
      referenceId,
      meta: ledgerMeta,
    });
    let updatedLocked: LockedUser = {
      ...locked,
      wallet_balance: after,
      coin_balance: after,
    };
    if (xpSource) {
      updatedLocked = await this.awardXpForSpend(
        tx,
        updatedLocked,
        amt,
        xpSource,
        referenceId,
      );
    }
    return { after, locked: updatedLocked, replayed: false };
  }

  /**
   * XP for a coin spend, in the same transaction as the debit.
   * Ledger row uses coin_amount 0 so coin sums stay coin sums.
   */
  async awardXpForSpend(
    tx: Tx,
    locked: LockedUser,
    coinsSpent: bigint | number,
    source: string,
    relatedReferenceId?: string,
  ): Promise<LockedUser> {
    await ensureLaravelLevelBands(this.prisma);
    const settings = await tx.adminSetting.findUnique({ where: { id: 1 } });
    const ratio = Number(settings?.coinToXpRatio ?? 0.1);
    const xpDelta = Math.floor(Number(coinsSpent) * ratio);
    if (xpDelta < 1) return locked;
    const xpRef = relatedReferenceId ? `xp_${relatedReferenceId}` : undefined;
    const prior = await this.findByReference(tx, locked.id, xpRef);
    if (prior) return locked;
    const newXp = Number(locked.xp) + xpDelta;
    const levelRow = await tx.level.findFirst({
      where: { minXp: { lte: newXp }, maxXp: { gte: newXp } },
      orderBy: { level: 'desc' },
    });
    const newLevel = levelRow?.level ?? locked.level;
    await tx.user.update({
      where: { id: locked.id },
      data: { xp: newXp, exp: newXp, level: newLevel },
    });
    await this.writeLedger(tx, {
      userId: locked.id,
      type: 'XP',
      title: `XP from ${source}`,
      coinAmount: 0,
      balanceAfter: newXp,
      referenceId: xpRef,
      meta: {
        source,
        currency: 'xp',
        xp_delta: xpDelta,
        xp_balance_after: newXp,
        related_reference_id: relatedReferenceId ?? null,
      },
    });
    if (newLevel > locked.level) {
      await this.unlockLevelFrames(tx, locked.id, newLevel);
    }
    return { ...locked, xp: newXp, level: newLevel };
  }

  async unlockLevelFrames(tx: Tx, userId: bigint, level: number) {
    const freeFrames = await tx.frame.findMany({
      where: {
        isActive: true,
        isPremium: false,
        levelRequired: { lte: level },
        OR: [{ coinCost: null }, { coinCost: 0 }],
      },
    });
    for (const frame of freeFrames) {
      await tx.userUnlockedFrame.upsert({
        where: { userId_frameId: { userId, frameId: frame.id } },
        create: {
          userId,
          frameId: frame.id,
          coinsPaid: 0,
          unlockType: 'level',
        },
        update: {},
      });
    }
  }

  private async findByReference(tx: Tx, userId: bigint, referenceId?: string) {
    if (!referenceId) return null;
    return tx.coinTransaction.findFirst({
      where: { userId, referenceId },
    });
  }

  private withSource(
    meta: Prisma.InputJsonValue | undefined,
    source?: string,
  ): Prisma.InputJsonValue | undefined {
    if (!source) return meta;
    if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
      return { ...(meta as Record<string, unknown>), source };
    }
    return { source, currency: 'coins' };
  }
}

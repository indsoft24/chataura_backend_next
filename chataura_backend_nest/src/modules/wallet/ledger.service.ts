import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

type Tx = Prisma.TransactionClient | PrismaClient;

export interface LockedUser {
  id: bigint;
  wallet_balance: bigint;
  coin_balance: bigint;
  gems: bigint;
  referral_balance: bigint;
  inr_earnings_balance: bigint;
  usd_earnings_balance: bigint;
  xp: number;
  level: number;
  role: string;
}

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async lockUser(tx: Tx, userId: bigint): Promise<LockedUser | null> {
    const rows = await tx.$queryRaw<LockedUser[]>`
      SELECT id, wallet_balance, coin_balance, gems, referral_balance,
             inr_earnings_balance, usd_earnings_balance, xp, level, role
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
  ) {
    const amt = BigInt(amount);
    if (amt <= 0n) throw new Error('credit amount must be positive');
    const locked = existingLock ?? (await this.lockUser(tx, userId));
    if (!locked) throw new Error('USER_NOT_FOUND');
    const after = locked.wallet_balance + amt;
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
  ): Promise<{ after: bigint; locked: LockedUser }> {
    const amt = BigInt(amount);
    if (amt <= 0n) throw new Error('debit amount must be positive');
    const locked = existingLock ?? (await this.lockUser(tx, userId));
    if (!locked) throw new Error('USER_NOT_FOUND');
    if (locked.wallet_balance < amt) {
      throw Object.assign(new Error('INSUFFICIENT_BALANCE'), {
        code: 'INSUFFICIENT_BALANCE',
      });
    }
    const after = locked.wallet_balance - amt;
    await tx.user.update({
      where: { id: userId },
      data: {
        walletBalance: { decrement: amt },
        coinBalance: { decrement: amt },
      },
    });
    await this.writeLedger(tx, {
      userId,
      type,
      title,
      coinAmount: -amt,
      balanceAfter: after,
      referenceId,
      meta,
    });
    const updatedLocked: LockedUser = {
      ...locked,
      wallet_balance: after,
      coin_balance: after,
    };
    return { after, locked: updatedLocked };
  }
}

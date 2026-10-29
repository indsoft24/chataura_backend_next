import { Prisma, PrismaClient } from '@prisma/client';
import { svipMonth } from './svip.rules';

/**
 * SVIP points = coins spent on gifts, per IST month. Called by the ledger inside the gift
 * debit's transaction, so a replayed debit (same reference) never counts twice.
 */
export async function addSvipGiftPoints(
  tx: Prisma.TransactionClient | PrismaClient,
  userId: bigint,
  coins: bigint,
  at: Date = new Date(),
) {
  if (coins <= 0n) return;
  const month = svipMonth(at);
  await tx.svipMonthlyPoints.upsert({
    where: { userId_month: { userId, month } },
    create: { userId, month, points: coins },
    update: { points: { increment: coins } },
  });
}

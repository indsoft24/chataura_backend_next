import { Prisma, PrismaClient } from '@prisma/client';

type Tx = Prisma.TransactionClient | PrismaClient;

/** A revisit inside this window refreshes the time but does not count again. */
export const VISIT_COUNT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Whether a visit at `now` counts as a new one after the previous visit at `last`. */
export function countsAsNewVisit(last: Date | null, now: Date): boolean {
  return !last || now.getTime() - last.getTime() >= VISIT_COUNT_WINDOW_MS;
}

/** Log `viewerId` opening `targetId`'s profile (everyone is logged; only SVIP can read the list). */
export async function recordVisit(
  tx: Tx,
  targetId: bigint,
  viewerId: bigint,
  now: Date = new Date(),
) {
  const prev = await tx.userVisit.findUnique({
    where: { targetId_viewerId: { targetId, viewerId } },
  });
  if (!prev) {
    await tx.userVisit.create({
      data: { targetId, viewerId, lastVisitedAt: now },
    });
    return;
  }
  await tx.userVisit.update({
    where: { targetId_viewerId: { targetId, viewerId } },
    data: {
      lastVisitedAt: now,
      ...(countsAsNewVisit(prev.lastVisitedAt, now)
        ? { visitCount: { increment: 1 } }
        : {}),
    },
  });
}

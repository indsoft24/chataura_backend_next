import { Prisma, PrismaClient } from '@prisma/client';

/** A user wears up to this many medals on their profile. */
export const MEDAL_SLOTS = 3;

type Tx = Prisma.TransactionClient | PrismaClient;

/** Still owned at `now` (null expiry = permanent). */
export function medalLive(expiresAt: Date | null, now: Date): boolean {
  return !expiresAt || expiresAt > now;
}

/** Lowest free slot (1..MEDAL_SLOTS) given the slots of live worn medals, or null when full. */
export function freeSlot(taken: number[]): number | null {
  for (let s = 1; s <= MEDAL_SLOTS; s++) if (!taken.includes(s)) return s;
  return null;
}

/** Medals a user shows on their profile, in slot order. */
export async function wornMedals(
  tx: Tx,
  userId: bigint,
  now: Date = new Date(),
) {
  const rows = await tx.userMedal.findMany({
    where: {
      userId,
      wornSlot: { not: null },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      medal: { isActive: true },
    },
    include: { medal: true },
    orderBy: { wornSlot: 'asc' },
  });
  return rows.map((r) => ({
    id: Number(r.medalId),
    name: r.medal.name,
    image_url: r.medal.imageUrl,
    slot: r.wornSlot,
  }));
}

/**
 * Own `medalId` until `until`; wear it in a free slot when `wear` and one is free.
 * Used by grants (SVIP) inside their own transaction.
 */
export async function grantMedal(
  tx: Tx,
  userId: bigint,
  medalId: bigint,
  until: Date | null,
  source: string,
  wear: boolean,
) {
  const now = new Date();
  let slot: number | null = null;
  if (wear) {
    const worn = await tx.userMedal.findMany({
      where: { userId, wornSlot: { not: null }, medalId: { not: medalId } },
      select: { wornSlot: true, expiresAt: true },
    });
    slot = freeSlot(
      worn.filter((w) => medalLive(w.expiresAt, now)).map((w) => w.wornSlot!),
    );
  }
  const existing = await tx.userMedal.findUnique({
    where: { userId_medalId: { userId, medalId } },
  });
  await tx.userMedal.upsert({
    where: { userId_medalId: { userId, medalId } },
    create: { userId, medalId, expiresAt: until, source, wornSlot: slot },
    update: {
      expiresAt: until,
      source,
      ...(wear && existing?.wornSlot == null ? { wornSlot: slot } : {}),
    },
  });
}

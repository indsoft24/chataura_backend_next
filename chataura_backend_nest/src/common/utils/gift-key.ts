import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Stable gift identity.
 *
 * `gift_key` = "<category>.<slug(name)>" (e.g. "cp.wedding", "standard.wedding").
 * It is assigned once when the gift row is created and never changes afterwards
 * (rename / re-price / re-categorise in admin keep the same key), so clients can
 * use it as a permanent identifier. Clients must treat it as opaque — never parse it.
 *
 * The slug rules MUST match the backfill SQL in
 * prisma/migrations/20261004120000_gift_unique_key/migration.sql.
 */
export function giftKeySlug(name: string | null | undefined): string {
  const slug = String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || 'gift';
}

export function buildGiftKey(
  category: string | null | undefined,
  name: string | null | undefined,
): string {
  const cat = String(category ?? '').trim().toLowerCase() || 'standard';
  return `${cat}.${giftKeySlug(name)}`;
}

type GiftKeyDb = Pick<PrismaClient, 'gift'>;

/** Returns a key not used by any other gift: base, base_2, base_3, … */
export async function allocateGiftKey(
  prisma: GiftKeyDb,
  category: string | null | undefined,
  name: string | null | undefined,
): Promise<string> {
  const base = buildGiftKey(category, name);
  const taken = await prisma.gift.findMany({
    where: { giftKey: { startsWith: base } },
    select: { giftKey: true },
  });
  const used = new Set(taken.map((g) => g.giftKey));
  if (!used.has(base)) return base;
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${base}_${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}_${Date.now().toString(36)}`;
}

export function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}

/**
 * Safety net for rows created without a key (legacy seed scripts, empty-table
 * fallbacks). Only touches rows whose gift_key IS NULL.
 */
export async function backfillMissingGiftKeys(prisma: GiftKeyDb): Promise<void> {
  const rows = await prisma.gift.findMany({
    where: { giftKey: null },
    select: { id: true, name: true, category: true },
    orderBy: { id: 'asc' },
  });
  for (const row of rows) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const key = await allocateGiftKey(prisma, row.category, row.name);
        await prisma.gift.updateMany({
          where: { id: row.id, giftKey: null },
          data: { giftKey: key },
        });
        break;
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
  }
}

import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Public 7-digit user ID range (1000000–9999999). */
const MIN = 1_000_000;
const SPAN = 9_000_000;

/**
 * A random public ID that is not anyone's display_id AND not anyone's internal account id, so a
 * number typed into search / profile lookup can never mean two different people.
 */
export async function generateDisplayId(prisma: PrismaService): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const n = MIN + Math.floor(Math.random() * SPAN);
    const id = String(n);
    const taken = await prisma.user.findFirst({
      where: { OR: [{ displayId: id }, { id: BigInt(n) }] },
      select: { id: true },
    });
    if (!taken) return id;
  }
  throw new Error('Could not allocate a unique display id');
}

export function isDisplayIdConflict(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') {
    return false;
  }
  const target = (e.meta as { target?: string[] | string } | undefined)?.target;
  const fields = Array.isArray(target) ? target : [String(target ?? '')];
  return fields.some((f) => f.includes('display_id') || f.includes('displayId'));
}

/**
 * Runs [write] with a fresh display id, retrying when two sign-ups raced to the same number
 * (unique index violation) instead of failing the sign-up.
 */
export async function withUniqueDisplayId<T>(
  prisma: PrismaService,
  write: (displayId: string) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const displayId = await generateDisplayId(prisma);
    try {
      return await write(displayId);
    } catch (e) {
      if (attempt < 4 && isDisplayIdConflict(e)) continue;
      throw e;
    }
  }
}

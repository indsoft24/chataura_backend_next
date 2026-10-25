import { ForbiddenException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { svipLevelOf } from './svip-chrome';

/** Lowest SVIP level that unlocks the functional privileges (pictures, visitors, profile background). */
export const SVIP_PRIVILEGE_LEVEL = 1;

type Tx = Prisma.TransactionClient | PrismaClient;

export async function svipLevelFor(tx: Tx, userId: bigint): Promise<number> {
  return svipLevelOf(await tx.userSvip.findUnique({ where: { userId } }));
}

/** 403 SVIP_REQUIRED unless the user holds at least `required`. Server-side gate for every privilege. */
export async function assertSvipLevel(
  tx: Tx,
  userId: bigint,
  required: number,
  what: string,
) {
  if (required <= 0) return;
  if ((await svipLevelFor(tx, userId)) >= required) return;
  throw new ForbiddenException({
    success: false,
    error: {
      code: 'SVIP_REQUIRED',
      message: `SVIP ${required} or higher is required to ${what}`,
      required_level: required,
    },
  });
}

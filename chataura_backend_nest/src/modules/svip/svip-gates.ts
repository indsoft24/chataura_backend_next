import { ForbiddenException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { svipFullLevelOf } from './svip-chrome';

/** Lowest SVIP level that unlocks the functional privileges (pictures, visitors, profile background). */
export const SVIP_PRIVILEGE_LEVEL = 1;

/** Lowest SVIP level with hidden profile visits. */
export const SVIP_STEALTH_LEVEL = 2;

/** Lowest SVIP level that hosts cannot kick. */
export const SVIP_KICK_PROTECT_LEVEL = 3;

/** Lowest SVIP level that earns extra XP, and the extra share (+20%). */
export const SVIP_XP_BOOST_LEVEL = 2;
export const SVIP_XP_BOOST_PCT = 20;

/** `xp` plus the SVIP bonus for a member at `level` (whole XP, rounded down). */
export function boostXp(xp: number, level: number): number {
  if (xp <= 0 || level < SVIP_XP_BOOST_LEVEL) return xp;
  return Math.floor((xp * (100 + SVIP_XP_BOOST_PCT)) / 100);
}

/** XP a member really earns: every XP source goes through this so SVIP 2+ gets +20% everywhere. */
export async function svipBoostedXp(tx: Tx, userId: bigint, xp: number): Promise<number> {
  if (xp <= 0) return xp;
  return boostXp(xp, await svipLevelFor(tx, userId));
}

type Tx = Prisma.TransactionClient | PrismaClient;

export async function svipLevelFor(tx: Tx, userId: bigint): Promise<number> {
  return svipFullLevelOf(await tx.userSvip.findUnique({ where: { userId } }));
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

/** 403 SVIP_KICK_PROTECTED when the member holds SVIP 3 or higher (hosts cannot kick them). */
export async function assertKickable(tx: Tx, userId: bigint) {
  if ((await svipLevelFor(tx, userId)) < SVIP_KICK_PROTECT_LEVEL) return;
  throw new ForbiddenException({
    success: false,
    error: { code: 'SVIP_KICK_PROTECTED', message: 'This member has SVIP kick protection' },
  });
}

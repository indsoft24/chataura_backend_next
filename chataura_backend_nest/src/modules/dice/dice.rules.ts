import { randomInt } from 'crypto';

/** One new roll per user every 3 s. */
export const DICE_COOLDOWN_MS = 3_000;
/** An SVIP member may re-roll the same roll only within 10 s of rolling it. */
export const DICE_REFRESH_WINDOW_MS = 10_000;

/** Server-side die: 1–6 from the crypto RNG. */
export function rollDie(): number {
  return randomInt(1, 7);
}

/** Milliseconds until this user may roll again (0 = now). */
export function cooldownLeft(lastRollAt: Date | null, now: Date): number {
  if (!lastRollAt) return 0;
  return Math.max(0, DICE_COOLDOWN_MS - (now.getTime() - lastRollAt.getTime()));
}

export type RefreshError =
  'NOT_YOUR_ROLL' | 'SVIP_REQUIRED' | 'REFRESH_EXPIRED' | 'NO_REFRESHES_LEFT';

/** Why this re-roll is refused, or null. `allowed` = re-rolls the user's SVIP level gives (0 = none). */
export function refreshError(
  roll: { userId: bigint; createdAt: Date; refreshCount: number },
  userId: bigint,
  allowed: number,
  now: Date,
): RefreshError | null {
  if (roll.userId !== userId) return 'NOT_YOUR_ROLL';
  if (allowed <= 0) return 'SVIP_REQUIRED';
  if (now.getTime() - roll.createdAt.getTime() > DICE_REFRESH_WINDOW_MS)
    return 'REFRESH_EXPIRED';
  if (roll.refreshCount >= allowed) return 'NO_REFRESHES_LEFT';
  return null;
}

export type DiceEvent = {
  roll_id: number;
  user_id: number;
  value: number;
  svip_level: number;
  refresh_count: number;
  refreshes_left: number;
  refresh_until: string | null;
};

export function diceEvent(
  roll: {
    id: bigint;
    userId: bigint;
    value: number;
    svipLevel: number;
    refreshCount: number;
    createdAt: Date;
  },
  allowed: number,
): DiceEvent {
  const left = Math.max(0, allowed - roll.refreshCount);
  return {
    roll_id: Number(roll.id),
    user_id: Number(roll.userId),
    value: roll.value,
    svip_level: roll.svipLevel,
    refresh_count: roll.refreshCount,
    refreshes_left: left,
    refresh_until:
      left > 0
        ? new Date(
            roll.createdAt.getTime() + DICE_REFRESH_WINDOW_MS,
          ).toISOString()
        : null,
  };
}

/** Room chat command, written by the server only (`origin: server`). */
export function diceCommand(event: DiceEvent): string {
  return `CMD:DICE:${JSON.stringify(event)}`;
}

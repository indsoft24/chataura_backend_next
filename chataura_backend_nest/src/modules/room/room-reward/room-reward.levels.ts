/**
 * Room Reward level table rules (pure, unit tested). Shared by the admin editor (validation),
 * the level engine (which levels are due) and the app API (progress / next level).
 */
export type RewardLevel = {
  level: number;
  minVisitors: number;
  minRoomCoins: bigint;
  ownerReward: bigint;
  /** Paid to EACH partner. */
  partnerReward: bigint;
  partnerCount: number;
  isActive: boolean;
};

/** Total paid when a level completes: owner + partner reward × partner count. */
export function levelTotal(l: Pick<RewardLevel, 'ownerReward' | 'partnerReward' | 'partnerCount'>): bigint {
  return l.ownerReward + l.partnerReward * BigInt(l.partnerCount);
}

/** Published starting table (also seeded by migration 20261011120000_room_reward_levels). */
export const DEFAULT_ROOM_REWARD_LEVELS: RewardLevel[] = (
  [
    [1, 5, 10_000_000, 1_100_000, 200_000, 1],
    [2, 5, 20_000_000, 2_200_000, 600_000, 1],
    [3, 10, 40_000_000, 4_400_000, 800_000, 2],
    [4, 10, 60_000_000, 6_510_000, 830_000, 3],
    [5, 20, 90_000_000, 9_510_000, 1_230_000, 3],
    [6, 30, 120_000_000, 12_000_000, 1_300_000, 4],
    [7, 40, 150_000_000, 15_000_000, 1_500_000, 4],
    [8, 50, 200_000_000, 19_000_000, 1_680_000, 5],
    [9, 50, 400_000_000, 37_500_000, 2_900_000, 5],
    [10, 50, 800_000_000, 73_600_000, 4_800_000, 6],
    [11, 50, 1_200_000_000, 107_800_000, 6_700_000, 6],
    [12, 50, 1_600_000_000, 136_000_000, 8_000_000, 7],
    [13, 50, 2_000_000_000, 168_000_000, 10_000_000, 7],
    [14, 100, 2_500_000_000, 207_500_000, 12_500_000, 7],
    [15, 100, 3_000_000_000, 235_000_000, 14_750_000, 8],
    [16, 100, 6_000_000_000, 420_000_000, 30_000_000, 9],
    [17, 100, 9_000_000_000, 595_000_000, 42_500_000, 10],
    [18, 100, 12_000_000_000, 723_000_000, 57_000_000, 11],
    [19, 100, 15_000_000_000, 867_000_000, 65_250_000, 12],
  ] as const
).map(([level, minVisitors, coins, owner, partner, partners]) => ({
  level,
  minVisitors,
  minRoomCoins: BigInt(coins),
  ownerReward: BigInt(owner),
  partnerReward: BigInt(partner),
  partnerCount: partners,
  isActive: true,
}));

export type LevelTableIssue = { level: number; field: string; message: string };

/**
 * Problems that must block saving a level table:
 * - level numbers unique and >= 1; counts / rewards non-negative; coin targets > 0
 * - among ACTIVE levels in level order, coin targets strictly increase (a later level can never
 *   be easier to reach than an earlier one).
 * Visitor targets may go up or down — that's a product choice, not an error.
 */
export function validateLevelTable(levels: RewardLevel[]): LevelTableIssue[] {
  const issues: LevelTableIssue[] = [];
  const seen = new Set<number>();
  for (const l of levels) {
    if (!Number.isInteger(l.level) || l.level < 1) {
      issues.push({ level: l.level, field: 'level', message: 'Level must be a whole number ≥ 1' });
    }
    if (seen.has(l.level)) {
      issues.push({ level: l.level, field: 'level', message: 'Duplicate level number' });
    }
    seen.add(l.level);
    if (!Number.isInteger(l.minVisitors) || l.minVisitors < 0) {
      issues.push({ level: l.level, field: 'min_visitors', message: 'Visitors must be ≥ 0' });
    }
    if (l.minRoomCoins <= 0n) {
      issues.push({ level: l.level, field: 'min_room_coins', message: 'Room coins target must be > 0' });
    }
    if (l.ownerReward < 0n) {
      issues.push({ level: l.level, field: 'owner_reward', message: 'Owner reward must be ≥ 0' });
    }
    if (l.partnerReward < 0n) {
      issues.push({ level: l.level, field: 'partner_reward', message: 'Partner reward must be ≥ 0' });
    }
    if (!Number.isInteger(l.partnerCount) || l.partnerCount < 0) {
      issues.push({ level: l.level, field: 'partner_count', message: 'Partners must be ≥ 0' });
    }
  }
  const active = levels.filter((l) => l.isActive).sort((a, b) => a.level - b.level);
  for (let i = 1; i < active.length; i++) {
    if (active[i].minRoomCoins <= active[i - 1].minRoomCoins) {
      issues.push({
        level: active[i].level,
        field: 'min_room_coins',
        message: `Must be higher than level ${active[i - 1].level} (${active[i - 1].minRoomCoins})`,
      });
    }
  }
  return issues;
}

/**
 * Active, unpaid levels whose coin target the room has reached, in payout order (lowest level
 * first). The engine pays them one by one and stops at the first whose visitor target isn't met
 * (that one becomes "pending"), so levels are always paid in order. Disabled levels are skipped.
 */
export function dueLevels(
  levels: RewardLevel[],
  paidLevels: ReadonlySet<number>,
  lifetimeCoins: bigint,
): RewardLevel[] {
  return levels
    .filter((l) => l.isActive && !paidLevels.has(l.level) && lifetimeCoins >= l.minRoomCoins)
    .sort((a, b) => a.level - b.level);
}

/** The next active, unpaid level (for the progress meter), or null when all are done. */
export function nextLevel(levels: RewardLevel[], paidLevels: ReadonlySet<number>): RewardLevel | null {
  return (
    levels
      .filter((l) => l.isActive && !paidLevels.has(l.level))
      .sort((a, b) => a.level - b.level)[0] ?? null
  );
}

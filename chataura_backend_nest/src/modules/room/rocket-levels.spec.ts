import {
  activeLadder,
  cycleKeyAt,
  eventExpiry,
  LevelRow,
  nextLevelAfter,
  nextResetAt,
  pickLuckyWinners,
  resolveLevel,
  sniffAsset,
  snapshotOf,
  splitContribution,
  splitLucky,
  validateLevels,
} from './rocket-levels';

const IST = { dailyResetEnabled: true, resetTimezone: 'Asia/Kolkata', resetHour: 4 };

const campaign = {
  launchThresholdCoins: 3_000_000,
  rewardPoolPercentage: 15,
  maxWinnersCount: 7,
  rewardDistributionRules: [40, 25, 15, 10, 5, 3, 2],
  minimumContributionRequired: 1,
  rockitDurationSeconds: 3600,
  expiryMode: 'RESET_PROGRESS',
  carryOverflow: true,
  ...IST,
};

function lvl(level: number, threshold: number): LevelRow {
  return {
    level,
    name: `L${level}`,
    thresholdCoins: threshold,
    rewardPoolPercentage: 12,
    maxWinnersCount: 5,
    rewardDistributionRules: [40, 25, 15, 12, 8],
    frameId: null,
    frameWinners: 3,
    frameDays: 1,
    xpRate: 0.02,
    minXp: 20,
    durationSeconds: 0,
    themeColor: '#10B981',
    visualTier: Math.min(level, 5),
    launchAssetKey: null,
    stationAssetKey: null,
    badgeAssetKey: null,
    luckyAudiencePercent: 0,
    luckyPoolPercentage: 0,
    isActive: true,
  };
}

const ladder = [lvl(1, 10e6), lvl(2, 30e6), lvl(3, 60e6), lvl(4, 100e6), lvl(5, 150e6)];

describe('rocket ladder cycle (04:00 IST)', () => {
  it('03:59 IST belongs to the previous day cycle', () => {
    // 2026-10-12 03:59 IST = 2026-10-11 22:29 UTC
    expect(cycleKeyAt(new Date('2026-10-11T22:29:00Z'), IST)).toBe('2026-10-11');
  });
  it('04:00 IST starts a new cycle', () => {
    expect(cycleKeyAt(new Date('2026-10-11T22:30:00Z'), IST)).toBe('2026-10-12');
  });
  it('next reset is the coming 04:00 IST', () => {
    expect(nextResetAt(new Date('2026-10-12T10:00:00Z'), IST)?.toISOString()).toBe('2026-10-12T22:30:00.000Z');
    expect(nextResetAt(new Date('2026-10-11T22:00:00Z'), IST)?.toISOString()).toBe('2026-10-11T22:30:00.000Z');
  });
  it('event expiry is capped at the reset', () => {
    const now = new Date('2026-10-12T22:00:00Z');
    expect(eventExpiry(now, 0, campaign).toISOString()).toBe('2026-10-12T22:30:00.000Z');
    expect(eventExpiry(now, 600, campaign).toISOString()).toBe('2026-10-12T22:10:00.000Z');
  });
  it('no daily reset uses a single cycle', () => {
    expect(cycleKeyAt(new Date(), { ...IST, dailyResetEnabled: false })).toBe('ALL');
  });
});

describe('level progression', () => {
  it('starts at LV1 and advances after launch', () => {
    expect(resolveLevel(ladder, null, 'RESET_PROGRESS').level).toBe(1);
    expect(resolveLevel(ladder, { status: 'LAUNCHED', level: 2 }, 'RESET_PROGRESS').level).toBe(3);
  });
  it('wraps to LV1 after the top level', () => {
    expect(nextLevelAfter(ladder, 5).level).toBe(1);
  });
  it('expiry keeps the level or resets the cycle per mode', () => {
    expect(resolveLevel(ladder, { status: 'EXPIRED', level: 3 }, 'RESET_PROGRESS').level).toBe(3);
    expect(resolveLevel(ladder, { status: 'EXPIRED', level: 3 }, 'RESET_CYCLE').level).toBe(1);
  });
  it('campaign without levels falls back to the legacy threshold', () => {
    const l = activeLadder(campaign, []);
    expect(l).toHaveLength(1);
    expect(l[0].thresholdCoins).toBe(3_000_000);
  });
});

describe('splitContribution', () => {
  it('below threshold applies everything', () => {
    expect(splitContribution(0, 10e6, 5e6, 30e6, true)).toEqual({ applied: 5e6, launches: false, carry: 0 });
  });
  it('overflow carries into next level', () => {
    expect(splitContribution(9e6, 10e6, 4e6, 30e6, true)).toEqual({ applied: 1e6, launches: true, carry: 3e6 });
  });
  it('carry never launches the next level immediately', () => {
    expect(splitContribution(0, 10e6, 100e6, 30e6, true).carry).toBe(30e6 - 1);
  });
  it('carry disabled drops overflow', () => {
    expect(splitContribution(9e6, 10e6, 4e6, 30e6, false)).toEqual({ applied: 1e6, launches: true, carry: 0 });
  });
});

describe('validateLevels', () => {
  const ok = [
    { level: 1, threshold_coins: 10e6, reward_pool_percentage: 12, reward_distribution_rules: [40, 25, 15, 12, 8] },
    { level: 2, threshold_coins: 30e6, reward_pool_percentage: 13, reward_distribution_rules: [35, 22, 15, 10, 8, 6, 4] },
  ];
  it('accepts a valid ladder', () => expect(validateLevels(ok)).toEqual([]));
  it('rejects split not summing to 100', () => {
    expect(validateLevels([{ ...ok[0], reward_distribution_rules: [50, 20] }]).join()).toContain('must be 100%');
  });
  it('rejects gaps and non-increasing targets', () => {
    expect(validateLevels([ok[0], { ...ok[1], level: 3 }]).join()).toContain('without gaps');
    expect(validateLevels([ok[0], { ...ok[1], threshold_coins: 5e6 }]).join()).toContain('higher than LV1');
  });
});

describe('sniffAsset', () => {
  const webm = Buffer.concat([Buffer.from('1a45dfa3', 'hex'), Buffer.alloc(100)]);
  it('accepts a real webm launch video', () => expect(sniffAsset('launch', 'a.webm', webm).ok).toBe(true));
  it('rejects renamed files', () => expect(sniffAsset('launch', 'a.webm', Buffer.alloc(100)).ok).toBe(false));
  it('rejects wrong type for slot', () => expect(sniffAsset('badge', 'a.webm', webm).ok).toBe(false));
  it('rejects oversize', () => {
    const big = Buffer.concat([Buffer.from('1a45dfa3', 'hex'), Buffer.alloc(9 * 1024 * 1024)]);
    expect(sniffAsset('launch', 'a.webm', big).ok).toBe(false);
  });
});

describe('lucky draw', () => {
  const people = Array.from({ length: 35 }, (_, i) => i + 1);

  it('picks 50% of 35 people = 17 distinct winners', () => {
    const w = pickLuckyWinners(people, 50, 1_000_000);
    expect(w).toHaveLength(17);
    expect(new Set(w).size).toBe(17);
    w.forEach((id) => expect(people).toContain(id));
  });
  it('gives at least one winner when the percent rounds down to zero', () =>
    expect(pickLuckyWinners([7], 50, 100)).toEqual([7]));
  it('is off at 0% or with nobody present', () => {
    expect(pickLuckyWinners(people, 0, 100)).toEqual([]);
    expect(pickLuckyWinners([], 50, 100)).toEqual([]);
  });
  it('never picks more winners than coins in the pool', () =>
    expect(pickLuckyWinners(people, 100, 4)).toHaveLength(4));

  it('splits the whole pool with every share above the floor', () => {
    const shares = splitLucky(105_000, 17);
    expect(shares).toHaveLength(17);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(105_000);
    const floor = Math.floor((105_000 / 17) * 0.3);
    shares.forEach((c) => expect(c).toBeGreaterThanOrEqual(floor));
  });
  it('gives every winner at least one coin when pool equals winners', () =>
    splitLucky(4, 4).forEach((c) => expect(c).toBeGreaterThanOrEqual(1)));
});

describe('admin target change on a live rocket', () => {
  it('re-snapshotting a lowered target launches on the next contribution', () => {
    const snap = snapshotOf(lvl(1, 3_500_000), campaign, false);
    // 3.75M already collected against the new 3.5M target: next gift launches, all coins carry over
    const r = splitContribution(3_751_549, snap.threshold, 1_000, 30_000_000, true);
    expect(r).toEqual({ applied: 0, launches: true, carry: 1_000 });
  });
  it('rejects reward pool + lucky pool above 100%', () => {
    const lv = { level: 1, threshold_coins: 3_500_000, reward_pool_percentage: 90, reward_distribution_rules: [100], lucky_pool_percentage: 20 };
    expect(validateLevels([lv]).join()).toContain('must not exceed 100%');
  });
});

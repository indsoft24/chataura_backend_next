import {
  giftCountsForRoomReward,
  isQualifiedVisitor,
  nextStayStart,
  rankPartners,
} from './room-reward.rules';

const t = (s: number) => new Date(Date.UTC(2026, 9, 11, 12, 0, s));
const MIN = 60_000;

describe('stay tracking', () => {
  it('starts a new stay on first join or after a long absence', () => {
    expect(nextStayStart(null, t(0), 2 * MIN)).toEqual(t(0));
    const prev = { stayStartedAt: new Date(t(0).getTime() - 30 * MIN), lastHeartbeatAt: new Date(t(0).getTime() - 5 * MIN) };
    expect(nextStayStart(prev, t(0), 2 * MIN)).toEqual(t(0));
  });

  it('keeps the stay across a short drop / rejoin', () => {
    const start = new Date(t(0).getTime() - 30 * MIN);
    const prev = { stayStartedAt: start, lastHeartbeatAt: new Date(t(0).getTime() - 90_000) };
    expect(nextStayStart(prev, t(0), 2 * MIN)).toEqual(start);
  });

  it('never breaks on normal heartbeat spacing even with a 0-minute gap setting', () => {
    const start = new Date(t(0).getTime() - 30 * MIN);
    const prev = { stayStartedAt: start, lastHeartbeatAt: new Date(t(0).getTime() - 20_000) };
    expect(nextStayStart(prev, t(0), 0)).toEqual(start);
  });
});

describe('qualified visitors', () => {
  const owner = 1n;
  const base = { userId: 7n, isActive: true, stayStartedAt: new Date(t(0).getTime() - 11 * MIN), lastHeartbeatAt: t(0) };

  it('counts members present long enough, excluding the owner', () => {
    expect(isQualifiedVisitor(base, owner, t(0), 10 * MIN, 2 * MIN)).toBe(true);
    expect(isQualifiedVisitor({ ...base, userId: owner }, owner, t(0), 10 * MIN, 2 * MIN)).toBe(false);
  });

  it('rejects newcomers, departed and silent members', () => {
    expect(isQualifiedVisitor({ ...base, stayStartedAt: new Date(t(0).getTime() - 5 * MIN) }, owner, t(0), 10 * MIN, 2 * MIN)).toBe(false);
    expect(isQualifiedVisitor({ ...base, isActive: false }, owner, t(0), 10 * MIN, 2 * MIN)).toBe(false);
    expect(isQualifiedVisitor({ ...base, lastHeartbeatAt: new Date(t(0).getTime() - 3 * MIN) }, owner, t(0), 10 * MIN, 2 * MIN)).toBe(false);
  });
});

describe('partner ranking', () => {
  const now = t(0);
  const c = (id: bigint, coins: number, minutesAgo: number) => ({
    userId: id,
    giftedCoins: BigInt(coins),
    stayStartedAt: new Date(now.getTime() - minutesAgo * MIN),
  });

  it('ranks by gifting, then longer stay, then id', () => {
    const ranked = rankPartners([c(5n, 100, 20), c(6n, 500, 15), c(7n, 100, 40), c(8n, 0, 90), c(4n, 100, 40)], 4, now);
    expect(ranked.map((r) => r.userId)).toEqual([6n, 4n, 7n, 5n]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    expect(ranked[0].staySeconds).toBe(15 * 60);
  });

  it('fills empty slots with longest-staying non-gifters and never exceeds slots', () => {
    const ranked = rankPartners([c(1n, 0, 10), c(2n, 0, 50), c(3n, 10, 11)], 2, now);
    expect(ranked.map((r) => r.userId)).toEqual([3n, 2n]);
    expect(rankPartners([c(1n, 0, 10)], 3, now)).toHaveLength(1);
    expect(rankPartners([c(1n, 0, 10)], 0, now)).toEqual([]);
  });
});

describe('counted gifts', () => {
  it('excludes CP/BCP and the owner\'s own gifts', () => {
    expect(giftCountsForRoomReward('standard', 2n, 1n)).toBe(true);
    expect(giftCountsForRoomReward('cp', 2n, 1n)).toBe(false);
    expect(giftCountsForRoomReward('BCP', 2n, 1n)).toBe(false);
    expect(giftCountsForRoomReward('standard', 1n, 1n)).toBe(false);
  });
});

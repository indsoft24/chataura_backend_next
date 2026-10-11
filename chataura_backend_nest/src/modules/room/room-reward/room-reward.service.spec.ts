jest.mock('@nestjs/schedule', () => ({ Cron: () => () => undefined }));
jest.mock('../../../common/fcm/realtime.service', () => ({ RealtimeService: class {} }));
jest.mock('../../../common/fcm/fcm.service', () => ({ FcmService: class {} }));
jest.mock('../../../common/redis/redis.service', () => ({ RedisService: class {} }));
jest.mock('../../../common/prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../../wallet/ledger.service', () => ({ LedgerService: class {} }));

import { RoomRewardService } from './room-reward.service';

const ROOM = '11111111-2222-3333-4444-555555555555';
const OWNER = 1n;
const MIN = 60_000;

type Member = { userId: bigint; isActive: boolean; stayStartedAt: Date | null; lastHeartbeatAt: Date | null };

/** Minimal in-memory stand-in for the Prisma calls the engine makes. */
function makeWorld(opts: {
  enabled?: boolean;
  coins: bigint;
  members: Member[];
  gifting?: Record<string, bigint>;
  paidLevels?: number[];
}) {
  const now = Date.now();
  const credits: Array<{ userId: bigint; amount: bigint; ref: string }> = [];
  const payouts: Array<{ level: number; data: any }> = (opts.paidLevels ?? []).map((l) => ({ level: l, data: {} }));
  const progress = { roomId: ROOM, lifetimeCoins: opts.coins, lastLevel: 0, pendingLevel: null as number | null };
  let levelCoinsReset = 0;
  const events: string[] = [];

  const levels = [
    { level: 1, minVisitors: 2, minRoomCoins: 100n, ownerReward: 50n, partnerReward: 10n, partnerCount: 1, isActive: true },
    { level: 2, minVisitors: 2, minRoomCoins: 200n, ownerReward: 80n, partnerReward: 20n, partnerCount: 2, isActive: true },
    { level: 3, minVisitors: 5, minRoomCoins: 300n, ownerReward: 99n, partnerReward: 30n, partnerCount: 3, isActive: true },
  ];

  const prisma: any = {
    adminSetting: {
      findUnique: async () => ({
        extraSettings: { room_reward_enabled: opts.enabled ?? true, room_reward_presence_minutes: 10, room_reward_presence_gap_minutes: 2 },
      }),
    },
    roomRewardLevel: { findMany: async () => levels.map((l) => ({ ...l })) },
    roomRewardProgress: {
      findUnique: async () => ({ ...progress }),
      update: async ({ data }: any) => Object.assign(progress, data),
    },
    roomRewardPayout: {
      findMany: async () => payouts.map((p) => ({ level: p.level })),
      findUnique: async ({ where }: any) =>
        payouts.find((p) => p.level === where.roomId_level.level) ? { id: 1n } : null,
      create: async ({ data }: any) => {
        payouts.push({ level: data.level, data });
        return { id: BigInt(payouts.length), ...data };
      },
    },
    room: { findUnique: async () => ({ id: ROOM, ownerId: OWNER, displayId: '1234567', title: 'R' }) },
    roomMember: { findMany: async () => opts.members },
    roomRewardGifting: {
      findMany: async ({ where }: any) =>
        (where.userId.in as bigint[]).map((id) => ({ userId: id, levelCoins: opts.gifting?.[id.toString()] ?? 0n })),
      updateMany: async () => {
        levelCoinsReset++;
        return { count: 1 };
      },
    },
    user: { findMany: async () => [] },
    $executeRaw: async () => 1,
  };
  prisma.$transaction = async (fn: any) => fn(prisma);

  const ledger: any = {
    lockUser: async (_tx: any, id: bigint) => ({ id, wallet_balance: 0n }),
    creditCoins: async (_tx: any, userId: bigint, amount: bigint, _t: string, _title: string, ref: string) => {
      credits.push({ userId, amount, ref });
      return amount;
    },
  };
  const redis: any = { getClient: () => ({ set: async () => 'OK', del: async () => 1 }) };
  const realtime: any = { publishRoomEvent: async (_r: string, e: { text: string }) => { events.push(e.text); return true; } };
  const fcm: any = { sendUserNotification: async () => undefined };

  const service = new RoomRewardService(prisma, ledger, redis, realtime, fcm);
  const member = (id: bigint, minutesIn: number): Member => ({
    userId: id,
    isActive: true,
    stayStartedAt: new Date(now - minutesIn * MIN),
    lastHeartbeatAt: new Date(now - 5_000),
  });
  return { service, credits, payouts, progress, events, member, resets: () => levelCoinsReset };
}

const flush = () => new Promise((r) => setImmediate(r));

describe('RoomRewardService.evaluate', () => {
  it('pays every reached level in order, owner + top partners by gifting', async () => {
    const w0 = makeWorld({ coins: 0n, members: [] });
    const w = makeWorld({
      coins: 250n,
      members: [w0.member(OWNER, 60), w0.member(5n, 30), w0.member(6n, 20), w0.member(7n, 15)],
      gifting: { '6': 500n, '7': 500n },
    });
    expect(await w.service.evaluate(ROOM)).toBe(2);
    expect(w.payouts.map((p) => p.level)).toEqual([1, 2]);
    // L1: owner 50 + 1 partner (6 and 7 tie on gifting; 6 stayed longer)
    // L2: owner 80 + 2 partners (6, 7)
    expect(w.credits.map((c) => `${c.userId}:${c.amount}`)).toEqual(['1:50', '6:10', '1:80', '6:20', '7:20']);
    expect(w.credits.every((c) => c.ref.startsWith(`room_reward_${ROOM}_`))).toBe(true);
    expect(w.resets()).toBe(1);
    await flush();
    expect(w.events.some((e) => e.startsWith('CMD:ROOM_REWARD:'))).toBe(true);
  });

  it('marks the level pending when visitors are short and pays nothing', async () => {
    const w0 = makeWorld({ coins: 0n, members: [] });
    const w = makeWorld({ coins: 150n, members: [w0.member(5n, 30), w0.member(6n, 3)] });
    expect(await w.service.evaluate(ROOM)).toBe(0);
    expect(w.credits).toEqual([]);
    expect(w.progress.pendingLevel).toBe(1);
  });

  it('stops at the first level short on visitors (later levels wait)', async () => {
    const w0 = makeWorld({ coins: 0n, members: [] });
    const w = makeWorld({ coins: 400n, members: [w0.member(5n, 30), w0.member(6n, 30)], paidLevels: [1, 2] });
    expect(await w.service.evaluate(ROOM)).toBe(0);
    expect(w.progress.pendingLevel).toBe(3);
  });

  it('never pays a level twice', async () => {
    const w0 = makeWorld({ coins: 0n, members: [] });
    const w = makeWorld({ coins: 150n, members: [w0.member(5n, 30), w0.member(6n, 30)], paidLevels: [1] });
    expect(await w.service.evaluate(ROOM)).toBe(0);
    expect(w.credits).toEqual([]);
  });

  it('does nothing while the feature is off', async () => {
    const w0 = makeWorld({ coins: 0n, members: [] });
    const w = makeWorld({ enabled: false, coins: 999n, members: [w0.member(5n, 30), w0.member(6n, 30)] });
    expect(await w.service.evaluate(ROOM)).toBe(0);
    expect(w.payouts).toEqual([]);
  });
});

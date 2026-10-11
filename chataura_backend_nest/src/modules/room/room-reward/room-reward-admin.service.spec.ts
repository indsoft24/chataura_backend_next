jest.mock('../../../common/prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('./room-reward.service', () => ({ RoomRewardService: class {} }));

import { RoomRewardAdminService } from './room-reward-admin.service';

const row = (level: number, coins: number, active = true) => ({
  level,
  min_visitors: 5,
  min_room_coins: coins,
  owner_reward: 100,
  partner_reward: 10,
  partner_count: 2,
  is_active: active,
});

function setup(opts: { existing: number[]; paidLevels: number[]; progress?: Array<{ roomId: string; lifetimeCoins: bigint }> }) {
  const ops: string[] = [];
  const tx: any = {
    roomRewardLevel: {
      findMany: async () => opts.existing.map((level) => ({ level })),
      update: async ({ where }: any) => ops.push(`deactivate:${where.level}`),
      delete: async ({ where }: any) => ops.push(`delete:${where.level}`),
      upsert: async ({ where }: any) => ops.push(`upsert:${where.level}`),
    },
  };
  const prisma: any = {
    ...tx,
    $transaction: async (fn: any) => fn(tx),
    roomRewardPayout: {
      groupBy: async () => opts.paidLevels.map((level) => ({ level, _count: { _all: 1 } })),
      findMany: async () => opts.paidLevels.map((level) => ({ roomId: 'paid-room', level })),
    },
    roomRewardProgress: { findMany: async () => opts.progress ?? [] },
  };
  prisma.roomRewardLevel = { ...tx.roomRewardLevel, findMany: async () => [] };
  let caughtUp = 0;
  const rewards: any = { evaluateAllEligible: async () => { caughtUp++; return 0; } };
  return { svc: new RoomRewardAdminService(prisma, rewards), ops, caughtUp: () => caughtUp };
}

describe('RoomRewardAdminService', () => {
  it('rejects an invalid table without writing', async () => {
    const { svc, ops } = setup({ existing: [1], paidLevels: [] });
    await expect(svc.saveLevels({ levels: [row(1, 100), row(2, 50)] as any }, 1n)).rejects.toMatchObject({
      response: { error: { code: 'INVALID_LEVELS' } },
    });
    expect(ops).toEqual([]);
  });

  it('removed levels: deleted if never paid, deactivated if any room was paid', async () => {
    const { svc, ops, caughtUp } = setup({ existing: [1, 2, 3], paidLevels: [2] });
    await svc.saveLevels({ levels: [row(1, 100)] as any }, 1n);
    expect(ops).toEqual(expect.arrayContaining(['deactivate:2', 'delete:3', 'upsert:1']));
    await new Promise((r) => setImmediate(r));
    expect(caughtUp()).toBe(1);
  });

  it('preview counts rooms that would complete a level immediately', async () => {
    const { svc } = setup({
      existing: [],
      paidLevels: [],
      progress: [
        { roomId: 'a', lifetimeCoins: 150n },
        { roomId: 'b', lifetimeCoins: 250n },
      ],
    });
    const res = await svc.preview({ levels: [row(1, 100), row(2, 200)] as any });
    expect(res.issues).toEqual([]);
    expect(res.impact).toEqual([
      { level: 1, rooms_due: 2, max_coins: 240 },
      { level: 2, rooms_due: 1, max_coins: 120 },
    ]);
    expect(res.max_immediate_coins).toBe(360);
  });
});

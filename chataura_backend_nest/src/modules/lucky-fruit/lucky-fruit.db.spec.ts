jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class {} }));
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { LedgerService } from '../wallet/ledger.service';
import { GameHistoryService } from '../game-history/game-history.service';
import { LuckyFruitService } from './lucky-fruit.service';

// Needs a migrated throwaway DB: LF_DB_TEST=1 DATABASE_URL=…/lf_tmp npx jest lucky-fruit.db
const run = process.env.LF_DB_TEST ? describe : describe.skip;

run('lucky fruit money flow (real DB)', () => {
  const prisma = new PrismaClient();
  const games = { assertCanPlay: () => undefined };
  const svc = new LuckyFruitService(prisma as never, new LedgerService(prisma as never), new GameHistoryService(prisma as never), games as never);
  let uid = 0n;
  const wallet = async () => (await prisma.user.findUniqueOrThrow({ where: { id: uid } })).walletBalance;
  const setExtra = (extra: object) =>
    prisma.adminSetting.upsert({ where: { id: 1 }, create: { id: 1, extraSettings: extra }, update: { extraSettings: extra } });

  beforeAll(async () => {
    uid = (await prisma.user.create({ data: { password: 'x', displayId: `lf${Date.now().toString().slice(-7)}`, walletBalance: 10_000_000n } })).id;
    await setExtra({ lucky_fruit_enabled: true, lucky_fruit_chest_rewards: [7000, 0, 0, 0, 0] });
  });
  afterAll(() => prisma.$disconnect());

  it('bets once per request, settles, pays, and opens the next round', async () => {
    const s0 = (await svc.state(uid)) as { phase: string; round_id: number };
    expect(s0.phase).toBe('betting');
    const before = await wallet();
    const id = randomUUID();
    await expect(svc.bet(uid, 'orange', 777, randomUUID())).rejects.toBeTruthy(); // not a chip
    await expect(svc.bet(uid, 'lucky', 1000, randomUUID())).rejects.toBeTruthy(); // bonus tile
    await svc.bet(uid, 'orange', 1000, id);
    await svc.bet(uid, 'orange', 1000, id); // retry: no second charge
    expect(await wallet()).toBe(before - 1000n);
    await svc.bet(uid, 'apple', 100_000, randomUUID());
    await expect(svc.bet(uid, 'apple', 100_000, randomUUID())).resolves.toBeTruthy();

    await prisma.luckyFruitRound.update({ where: { id: BigInt(s0.round_id) }, data: { closesAt: new Date(Date.now() - 1000) } });
    const r = (await svc.result(uid, BigInt(s0.round_id))) as { ready: boolean; user_bet: number; user_payout: number; user_balance: number };
    expect(r.ready).toBe(true);
    expect(r.user_bet).toBe(201_000);
    expect(await wallet()).toBe(before - 201_000n + BigInt(r.user_payout));
    expect(r.user_balance).toBe(Number(await wallet()));
    const again = (await svc.result(uid, BigInt(s0.round_id))) as { user_payout: number };
    expect(again.user_payout).toBe(r.user_payout); // settling twice pays once
    expect(await prisma.gameHistory.count({ where: { userId: uid, game: 'lucky_fruit' } })).toBe(1);
    const s1 = (await svc.state(uid)) as { phase: string; round_id: number; last_result: { round_id: number } };
    expect(s1.round_id).toBeGreaterThan(s0.round_id);
    expect(s1.phase).toBe('result');
    expect(s1.last_result.round_id).toBe(s0.round_id);
    await expect(svc.bet(uid, 'orange', 1000, randomUUID())).rejects.toBeTruthy(); // next round not open yet
  });

  it('chest needs turnover, pays once a day', async () => {
    await expect(svc.claimChest(uid, 0)).rejects.toBeTruthy(); // 201k < 5M
    await prisma.luckyFruitBet.create({
      data: { roundId: (await prisma.luckyFruitRound.findFirstOrThrow()).id, userId: uid, item: 'grape', amount: 5_000_000n, status: 'lost', clientUuid: randomUUID() },
    });
    const before = await wallet();
    await svc.claimChest(uid, 0);
    expect(await wallet()).toBe(before + 7000n);
    await expect(svc.claimChest(uid, 0)).rejects.toBeTruthy();
    await expect(svc.claimChest(uid, 1)).rejects.toBeTruthy(); // reward 0
  });
});

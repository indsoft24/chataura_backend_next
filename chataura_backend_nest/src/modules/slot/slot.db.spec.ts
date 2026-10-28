jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class {} }));
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { LedgerService } from '../wallet/ledger.service';
import { SlotService } from './slot.service';

// Needs a migrated throwaway DB: SLOT_DB_TEST=1 DATABASE_URL=…/slot_tmp npx jest slot.db
const run = process.env.SLOT_DB_TEST ? describe : describe.skip;

run('slot money flow (real DB)', () => {
  const prisma = new PrismaClient();
  const svc = new SlotService(prisma as never, new LedgerService(prisma as never));
  let uid = 0n;
  const wallet = async () => (await prisma.user.findUniqueOrThrow({ where: { id: uid } })).walletBalance;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  beforeAll(async () => {
    const u = await prisma.user.create({
      data: { password: 'x', displayId: `sl${Date.now().toString().slice(-7)}`, walletBalance: 10_000_000n },
    });
    uid = u.id;
    await prisma.adminSetting.upsert({
      where: { id: 1 },
      create: { id: 1, extraSettings: { slot_enabled: true } },
      update: { extraSettings: { slot_enabled: true } },
    });
  });
  afterAll(() => prisma.$disconnect());

  it('debits, credits, replays and refuses', async () => {
    await expect(svc.spin(uid, 12345, randomUUID())).rejects.toBeTruthy(); // not a bet level
    const id = randomUUID();
    const before = await wallet();
    const r = await svc.spin(uid, 100_000, id);
    expect(await wallet()).toBe(before - 100_000n + BigInt(r.payout));
    expect(r.balance).toBe(Number(await wallet()));
    const again = await svc.spin(uid, 100_000, id); // retry of the same request: no second charge
    expect(again.grid).toEqual(r.grid);
    expect(await wallet()).toBe(before - 100_000n + BigInt(r.payout));
    await expect(svc.spin(uid, 100_000, randomUUID())).rejects.toBeTruthy(); // too fast
    await sleep(800);
    await prisma.user.update({ where: { id: uid }, data: { walletBalance: 5_000n } });
    await expect(svc.spin(uid, 10_000, randomUUID())).rejects.toBeTruthy(); // insufficient
    expect(await wallet()).toBe(5_000n);
    expect((await svc.state(uid)).today_win).toBeGreaterThanOrEqual(0);
  });

  it('refuses bad bets and bad admin settings', async () => {
    await sleep(800);
    for (const bad of ['10000', '0x2710', ' 10000', 10000.5, -10000, null, {}, [10000]])
      await expect(svc.spin(uid, bad, randomUUID())).rejects.toBeTruthy();
    for (const patch of [
      { slot_rtp_preset: 99 },
      { slot_rtp_preset: '97' },
      { slot_bet_levels: [] },
      { slot_bet_levels: [7] },
      { slot_bet_levels: [50_000, 10_000] },
      { slot_bet_levels: [5, 10, 15, 20, 25, 30, 35, 40, 45] },
      { slot_bet_levels: ['10000'] },
      { slot_big_win_x: 0 },
      { slot_big_win_x: 5000 },
      { slot_big_win_x: 1.5 },
    ])
      await expect(svc.updateSettings(patch, uid)).rejects.toBeTruthy();
    const ok = await svc.updateSettings({ slot_rtp_preset: 96, slot_big_win_x: 20 }, uid);
    expect(ok.slot_rtp_preset).toBe(96);
    expect(ok.slot_enabled).toBe(true); // a partial update keeps the other values
    await svc.updateSettings({ slot_rtp_preset: 94, slot_big_win_x: 10 }, uid);
  });
});

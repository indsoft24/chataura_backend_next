jest.mock('@nestjs/schedule', () => ({ Cron: () => () => undefined }));
jest.mock('../../common/fcm/fcm.service', () => ({ FcmService: class {} }));
jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class {} }));
import { PrismaClient } from '@prisma/client';
import { LedgerService } from '../wallet/ledger.service';
import { SvipService } from './svip.service';

// Needs a migrated throwaway DB: SVIP_DB_TEST=1 DATABASE_URL=…/svip_tmp npx jest svip.db
const run = process.env.SVIP_DB_TEST ? describe : describe.skip;

run('SVIP by recharge (real DB)', () => {
  const prisma = new PrismaClient();
  const fcm = { sendUserNotification: async () => undefined };
  const svc = new SvipService(prisma as never, new LedgerService(prisma as never), fcm as never);
  const tag = Date.now().toString().slice(-6);
  let uid = 0n;
  const pay = (amountInr: number, source: 'RAZORPAY' | 'MOCK' = 'RAZORPAY', daysAgo = 0) =>
    prisma.coinPurchaseTransaction.create({
      data: {
        userId: uid,
        amountMinor: amountInr * 100,
        currency: 'INR',
        coinsCredited: amountInr * 100,
        status: 'success',
        paymentSource: source,
        createdAt: new Date(Date.now() - daysAgo * 86_400_000),
      },
    });

  beforeAll(async () => {
    uid = (await prisma.user.create({ data: { password: 'x', displayId: `sv${tag}` } })).id;
    for (const [level, rechargeInr, purchasePrice] of [[1, 500, 6_000_000n], [2, 1500, 18_000_000n]] as const)
      await prisma.svipLevelConfig.upsert({
        where: { level },
        create: { level, name: `SVIP ${level}`, purchasePrice, rechargeInr, monthlyReward: 0n, isActive: true },
        update: { rechargeInr, purchasePrice, isActive: true },
      });
    await prisma.adminSetting.upsert({
      where: { id: 1 },
      create: { id: 1, extraSettings: { svip_enabled: true } },
      update: { extraSettings: { svip_enabled: true } },
    });
    svc.invalidateConfig();
  });
  afterAll(() => prisma.$disconnect());

  it('5 x Rs 100 unlock SVIP 1 once, never twice; fake money and old recharges do not count', async () => {
    await pay(500, 'MOCK');
    await pay(900, 'RAZORPAY', 9); // outside the 5-day window
    expect(await svc.syncFromRecharges(uid)).toBe(false);
    for (let i = 4; i >= 1; i--) await pay(100, 'RAZORPAY', i);
    expect(await svc.syncFromRecharges(uid)).toBe(false); // 400
    await pay(100);
    expect(await svc.syncFromRecharges(uid)).toBe(true);
    expect(await svc.levelOf(uid)).toBe(1);
    expect(await svc.syncFromRecharges(uid)).toBe(false);
    const spent = await prisma.svipRechargeSpend.aggregate({ where: { userId: uid }, _sum: { amountInr: true } });
    expect(Number(spent._sum.amountInr)).toBe(500);
  });

  it('center shows credit, and the next level needs only the difference', async () => {
    await pay(300);
    const c = await svc.center(uid);
    expect(c.me).toMatchObject({ level: 1, recharge_credit_inr: 300, can_renew: false, renew_recharge_inr: 500 });
    expect(c.levels.find((l) => l.level === 2)).toMatchObject({ action: 'upgrade', recharge_inr: 1500, need_inr: 700 });
    await pay(700);
    expect(await svc.syncFromRecharges(uid)).toBe(true);
    expect(await svc.levelOf(uid)).toBe(2);
  });

  it('level art reaches the center and My Items (https only)', async () => {
    const medal = 'https://storage.googleapis.com/chataura/svip/v1/svip2_medal.webp';
    await prisma.svipLevelConfig.update({ where: { level: 2 }, data: { art: { medal, frame: 'http://insecure/x.webp', junk: 1 } } });
    svc.invalidateConfig();
    const c = await svc.center(uid);
    expect(c.levels.find((l) => l.level === 2)!.art).toEqual({ medal });
    expect(c.levels.find((l) => l.level === 1)!.art?.medal).toContain('svip1_medal'); // set by the migration
    expect((await svc.items(uid)).art).toEqual({ medal });
  });

  it('wearing the SVIP frame renews a stale unlock, so it is not swapped out', async () => {
    const level = await svc.levelOf(uid);
    const frame = await prisma.frame.upsert({
      where: { slug: `svip${level}_frame` },
      create: { name: `SVIP ${level}`, slug: `svip${level}_frame`, category: 'svip', isActive: true },
      update: { isActive: true },
    });
    await prisma.userUnlockedFrame.upsert({
      where: { userId_frameId: { userId: uid, frameId: frame.id } },
      create: { userId: uid, frameId: frame.id, coinsPaid: 0, unlockType: 'svip', expiresAt: new Date(Date.now() - 86_400_000) },
      update: { unlockType: 'svip', expiresAt: new Date(Date.now() - 86_400_000) },
    });
    await svc.updateItems(uid, { frame: true });
    const unlock = await prisma.userUnlockedFrame.findUniqueOrThrow({
      where: { userId_frameId: { userId: uid, frameId: frame.id } },
    });
    expect(unlock.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    expect((await prisma.user.findUniqueOrThrow({ where: { id: uid } })).selectedFrameId).toBe(frame.id);
  });

  it('the minute sweep finds the user by their new recharge', async () => {
    const u2 = (await prisma.user.create({ data: { password: 'x', displayId: `sw${tag}` } })).id;
    await prisma.coinPurchaseTransaction.create({
      data: { userId: u2, amountMinor: 50000, currency: 'INR', coinsCredited: 1, status: 'success', paymentSource: 'RAZORPAY' },
    });
    await svc.processRecharges();
    expect(await svc.levelOf(u2)).toBe(1);
  });
});

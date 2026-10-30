jest.mock('@nestjs/schedule', () => ({ Cron: () => () => undefined }));
jest.mock('../../common/fcm/fcm.service', () => ({ FcmService: class {} }));
jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class {} }));
import { PrismaClient } from '@prisma/client';
import { LedgerService } from '../wallet/ledger.service';
import { SvipSellerService } from './svip-seller.service';
import { SvipService } from './svip.service';

// Needs a migrated throwaway DB: SVIP_DB_TEST=1 DATABASE_URL=…/svipgift_tmp npx jest svip-seller.db
const run = process.env.SVIP_DB_TEST ? describe : describe.skip;

run('SVIP given by coin sellers (real DB)', () => {
  const prisma = new PrismaClient();
  const fcm = { sendUserNotification: async () => undefined };
  const ledger = new LedgerService(prisma as never);
  const svip = new SvipService(prisma as never, ledger, fcm as never);
  const seller = new SvipSellerService(prisma as never, ledger, svip, fcm as never);
  const tag = Date.now().toString().slice(-6);
  const ids: Record<string, bigint> = {};
  const rid = (s: string) => `${s}_${tag}_${Math.random().toString(36).slice(2, 8)}`;
  const balance = async (id: bigint) => Number((await prisma.user.findUniqueOrThrow({ where: { id } })).walletBalance);
  const code = async (p: Promise<unknown>) =>
    p.then(() => 'ok', (e) => (e.response?.error?.code ?? e.message) as string);

  beforeAll(async () => {
    for (const [k, role, wallet] of [['seller', 'seller', 20000n], ['u1', 'user', 0n], ['u2', 'user', 0n], ['plain', 'user', 99999n]] as const)
      ids[k] = (await prisma.user.create({ data: { password: 'x', displayId: `${k}${tag}`, role, walletBalance: wallet } })).id;
    for (const [level, rechargeInr, purchasePrice, sellerPrice] of [[1, 500, 6_000_000n, 3000n], [2, 1500, 18_000_000n, 9000n]] as const)
      await prisma.svipLevelConfig.upsert({
        where: { level },
        create: { level, name: `SVIP ${level}`, purchasePrice, rechargeInr, sellerPrice, monthlyReward: 0n, isActive: true },
        update: { rechargeInr, purchasePrice, sellerPrice, isActive: true },
      });
    await prisma.adminSetting.upsert({ where: { id: 1 }, create: { id: 1, extraSettings: { svip_enabled: true } }, update: { extraSettings: { svip_enabled: true } } });
    svip.invalidateConfig();
  });
  afterAll(() => prisma.$disconnect());

  it('charges the seller price once, gives SVIP, and a replay changes nothing', async () => {
    const body = { user: `u1${tag}`, level: 1, request_id: rid('a') };
    const r = await seller.gift(ids.seller, body);
    expect(r).toMatchObject({ kind: 'new', charged_coins: 3000, balance: 17000, replayed: false });
    expect(await svip.levelOf(ids.u1)).toBe(1);
    expect((await prisma.userSvip.findUniqueOrThrow({ where: { userId: ids.u1 } })).source).toBe('seller');
    const again = await seller.gift(ids.seller, body);
    expect(again.replayed).toBe(true);
    expect(await balance(ids.seller)).toBe(17000);
  });

  it('SVIP with recharge also credits the user and charges the seller for it', async () => {
    const r = await seller.gift(ids.seller, { user: `u1${tag}`, level: 1, with_recharge: true, recharge_coins: 500, request_id: rid('b') });
    expect(r).toMatchObject({ kind: 'extend', charged_coins: 3500, balance: 13500 });
    expect(await balance(ids.u1)).toBe(500);
  });

  it('upgrade allowed, lower blocked, wrong role and low balance refused without any change', async () => {
    expect((await seller.gift(ids.seller, { user: `u1${tag}`, level: 2, request_id: rid('c') })).kind).toBe('upgrade');
    expect(await balance(ids.seller)).toBe(4500);
    expect(await code(seller.gift(ids.seller, { user: `u1${tag}`, level: 1, request_id: rid('d') }))).toBe('LOWER_LEVEL');
    expect(await balance(ids.seller)).toBe(4500);
    expect(await code(seller.gift(ids.plain, { user: `u2${tag}`, level: 1, request_id: rid('e') }))).toBe('FORBIDDEN');
    expect(await code(seller.gift(ids.seller, { user: `u2${tag}`, level: 2, request_id: rid('f') }))).toBe('INSUFFICIENT_BALANCE');
    expect(await code(seller.gift(ids.seller, { user: `seller${tag}`, level: 1, request_id: rid('g') }))).toBe('SELF_GIFT_FORBIDDEN');
    expect(await svip.levelOf(ids.u2)).toBe(0);
    expect(await balance(ids.seller)).toBe(4500);
  });

  it('gifted SVIP cannot be renewed with the coin fee', async () => {
    await prisma.userSvip.update({ where: { userId: ids.u1 }, data: { periodEndsAt: new Date(Date.now() + 86_400_000) } });
    expect(await code(svip.renew(ids.u1))).toBe('RECHARGE_REQUIRED');
  });

  it('promo SVIP ends at once, with no grace', async () => {
    await prisma.userSvip.update({
      where: { userId: ids.u2 },
      data: { level: 1 },
    }).catch(() =>
      prisma.userSvip.create({ data: { userId: ids.u2, level: 1, source: 'promo', periodStartsAt: new Date(Date.now() - 8 * 86_400_000), periodEndsAt: new Date(Date.now() - 3_600_000) } }),
    );
    expect(await svip.levelOf(ids.u2)).toBe(0);
  });

  it('every seller coin movement is in the ledger and adds up', async () => {
    const rows = await prisma.coinTransaction.findMany({ where: { userId: ids.seller, type: 'SVIP_SELLER_GIFT' } });
    const spent = rows.reduce((t, r) => t + Math.abs(Number(r.coinAmount)), 0);
    expect(20000 - spent).toBe(await balance(ids.seller));
  });
});

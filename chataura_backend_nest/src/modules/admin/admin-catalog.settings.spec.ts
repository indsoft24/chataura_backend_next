jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
jest.mock('../gamification/bonus-spin.service', () => ({ SPIN_EXPECTED_PAYOUT: 1, SPIN_MIN_COST: 1 }));
jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class {} }));
import { AdminCatalogService } from './admin-catalog.service';

function world(extra: Record<string, unknown> = {}) {
  const row: any = { id: 1, giftCommissionPct: 20, starChatCommissionPct: 30, extraSettings: extra, gemsPerCoin: 10, coinToXpRatio: 0.1 };
  const gifts = new Map<number, any>([[1, { id: 1n, category: 'lucky', coinCost: 5000, name: 'Lucky Clover', isActive: true, giftKey: 'lucky.lucky_clover', requiredSvipLevel: 0 }]]);
  const prisma: any = {
    adminSetting: {
      findUnique: async () => ({ ...row }),
      upsert: async ({ update }: any) => (Object.assign(row, update), row),
    },
    gift: {
      findUnique: async ({ where }: any) => gifts.get(Number(where.id)) ?? null,
      findFirst: async () => null,
      findMany: async () => [],
      update: async ({ where, data }: any) => Object.assign(gifts.get(Number(where.id)), data),
      create: async ({ data }: any) => ({ id: 9n, imageUrl: null, animationUrl: null, isActive: true, requiredSvipLevel: 0, ...data }),
    },
  };
  return { svc: new AdminCatalogService(prisma, {} as never), row, gifts };
}
const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e: any) => e.getResponse?.().error?.code ?? e.message);

describe('admin settings: commission', () => {
  it('keeps what the admin typed when the screen also sends the old value', async () => {
    const w = world();
    await w.svc.updateSettings({ gift_commission_pct: 20, gift_commission_percent: 35, star_chat_commission_pct: 30, star_chat_commission_percent: 45 });
    expect(w.row.giftCommissionPct).toBe(35);
    expect(w.row.starChatCommissionPct).toBe(45);
  });

  it('still works when only one spelling is sent (staff commissions page)', async () => {
    const w = world();
    await w.svc.updateSettings({ gift_commission_pct: 12 });
    expect(w.row.giftCommissionPct).toBe(12);
    await w.svc.updateSettings({ gift_commission_percent: 15 });
    expect(w.row.giftCommissionPct).toBe(15);
  });
});

describe('admin: lucky gift minimum', () => {
  it('is validated and read back', async () => {
    const w = world();
    expect(await code(w.svc.updateSettings({ lucky_gift_min_coins: -1 }))).toBe('VALIDATION_ERROR');
    expect(await code(w.svc.updateSettings({ lucky_gift_min_coins: 1.5 }))).toBe('VALIDATION_ERROR');
    expect(await code(w.svc.updateSettings({ lucky_gift_min_coins: 'x' }))).toBe('VALIDATION_ERROR');
    const res: any = await w.svc.updateSettings({ lucky_gift_min_coins: 2500 });
    expect(res.settings.lucky_gift_min_coins).toBe(2500);
    expect(((await w.svc.settings()) as any).settings.lucky_gift_min_coins).toBe(2500);
  });

  it('a lucky gift cannot be priced below it, on create or edit; other categories are free', async () => {
    const w = world({ lucky_gift_min_coins: 2000 });
    expect(await code(w.svc.createGift({ name: 'Tiny', coin_cost: 1999, category: 'lucky' }))).toBe('VALIDATION_ERROR');
    expect(await code(w.svc.createGift({ name: 'Ok', coin_cost: 2000, category: 'lucky' }))).toBe('ok');
    expect(await code(w.svc.createGift({ name: 'Rose', coin_cost: 10, category: 'standard' }))).toBe('ok');
    expect(await code(w.svc.updateGift(1n, { coin_cost: 1000 }))).toBe('VALIDATION_ERROR');
    expect(await code(w.svc.updateGift(1n, { coin_cost: 2000 }))).toBe('ok');
    // switching on / off or renaming does not re-check the price
    expect(await code(w.svc.updateGift(1n, { is_active: false }))).toBe('ok');
    // moving a cheap standard gift into Lucky is checked against the floor too
    w.gifts.set(2, { id: 2n, category: 'standard', coinCost: 50, name: 'Heart', isActive: true, giftKey: 'standard.heart', requiredSvipLevel: 0 });
    expect(await code(w.svc.updateGift(2n, { category: 'lucky' }))).toBe('VALIDATION_ERROR');
    // 0 = no floor
    await w.svc.updateSettings({ lucky_gift_min_coins: 0 });
    expect(await code(w.svc.updateGift(2n, { category: 'lucky' }))).toBe('ok');
  });
});

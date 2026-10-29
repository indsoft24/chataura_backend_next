jest.mock('@nestjs/schedule', () => ({ Cron: () => () => undefined }));
jest.mock('../../common/fcm/fcm.service', () => ({ FcmService: class {} }));
jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
jest.mock('../wallet/ledger.service', () => ({ LedgerService: class {} }));

import { SvipService } from './svip.service';

const DAY = 86_400_000;
const USER = 7n;

/** Minimal in-memory stand-in for the Prisma + ledger calls SVIP makes. */
function makeWorld(opts: { wallet: bigint; enabled?: boolean }) {
  let wallet = opts.wallet;
  let member: any = null;
  const ledger: Array<{ type: string; amount: bigint; ref?: string }> = [];
  const notes: string[] = [];
  const FRAME = { id: 50n, slug: 'svip1_frame', category: 'svip' };
  const bar = (id: bigint, sortOrder: number, name: string) => ({
    id, name, svipLevel: 1, sortOrder, isActive: true, levelRequired: 1,
    imageUrl: null, animationUrl: `https://cdn/${name}.mp4`, compositeMode: 'screen',
  });
  // Two SVIP 1 choices; the lower sort order is the default.
  const BARS = [bar(61n, 1, 'armored'), bar(60n, 0, 'winged')];
  const byOrder = () =>
    [...BARS].sort((a, b) => a.sortOrder - b.sortOrder || Number(a.id - b.id));
  const user = {
    selectedFrameId: 9n as bigint | null,
    selectedEntryBarId: null as bigint | null,
  };
  const unlocks = new Map<
    string,
    { expiresAt: Date | null; unlockType: string }
  >();
  const levels = [
    {
      level: 1,
      name: 'SVIP 1',
      rechargeInr: 500,
      purchasePrice: 6_000_000n,
      monthlyReward: 300_000n,
      isActive: true,
    },
    {
      level: 2,
      name: 'SVIP 2',
      rechargeInr: 1500,
      purchasePrice: 18_000_000n,
      monthlyReward: 1_080_000n,
      isActive: true,
    },
  ];

  // Paid recharges and the rupees of them already used for SVIP.
  const recharges: any[] = [];
  const spends: Array<{ purchaseId: bigint; amountInr: number; kind: string }> = [];
  let nextRecharge = 1n;

  const prisma: any = {
    coinPurchaseTransaction: {
      findMany: async ({ where }: any) =>
        recharges
          .filter(
            (r) =>
              r.status === where.status &&
              r.paymentSource === where.paymentSource &&
              r.createdAt >= where.createdAt.gte,
          )
          .map((r) => ({ ...r, package: null })),
    },
    svipRechargeSpend: {
      groupBy: async () => {
        const by = new Map<bigint, number>();
        for (const x of spends) by.set(x.purchaseId, (by.get(x.purchaseId) ?? 0) + x.amountInr);
        return [...by].map(([purchaseId, v]) => ({ purchaseId, _sum: { amountInr: v } }));
      },
      create: async ({ data }: any) => void spends.push(data),
    },
    adminSetting: {
      findUnique: async () => ({
        extraSettings: { svip_enabled: opts.enabled ?? true },
      }),
    },
    svipLevelConfig: { findMany: async () => levels },
    userSvip: {
      findUnique: async () => (member ? { ...member } : null),
      upsert: async ({ create, update }: any) => {
        member = member
          ? { ...member, ...update, updatedAt: new Date() }
          : { ...create, updatedAt: new Date() };
      },
      update: async ({ data }: any) => {
        // Prisma ignores undefined fields.
        const set = Object.fromEntries(
          Object.entries(data).filter(([, v]) => v !== undefined),
        );
        member = { ...member, ...set, updatedAt: new Date() };
      },
    },
    user: {
      findUniqueOrThrow: async () => ({
        walletBalance: wallet,
        ...user,
        selectedEntryBar: BARS.find((b) => b.id === user.selectedEntryBarId) ?? null,
      }),
      findUnique: async () => ({ id: USER }),
      update: async ({ data }: any) => Object.assign(user, data),
      updateMany: async ({ where, data }: any) => {
        const hit =
          (where.selectedFrameId !== undefined &&
            user.selectedFrameId === where.selectedFrameId) ||
          (where.selectedEntryBarId !== undefined &&
            user.selectedEntryBarId === where.selectedEntryBarId) ||
          (where.selectedFrame && user.selectedFrameId === FRAME.id) ||
          (where.selectedEntryBar &&
            BARS.some((b) => b.id === user.selectedEntryBarId));
        if (hit) Object.assign(user, data);
      },
    },
    frame: {
      findFirst: async ({ where }: any) =>
        where.slug === FRAME.slug ? FRAME : null,
    },
    medal: { findFirst: async () => null },
    userMedal: { updateMany: async () => ({ count: 0 }) },
    entryBar: {
      findFirst: async ({ where }: any) =>
        where.svipLevel === 1 ? byOrder()[0] : null,
      findMany: async ({ where }: any) =>
        where.svipLevel.lte >= 1 ? byOrder() : [],
    },
    userUnlockedFrame: {
      updateMany: async ({ data }: any) =>
        unlocks.forEach((u) => (u.expiresAt = data.expiresAt)),
      upsert: async ({ where, create, update }: any) => {
        const k = where.userId_frameId.frameId.toString();
        unlocks.set(k, { ...(unlocks.get(k) ?? create), ...update });
      },
    },
    svipMonthlyPoints: { findUnique: async () => ({ points: 500n }) },
    coinTransaction: {
      findFirst: async ({ where }: any) =>
        ledger.find((l) => l.ref === where.referenceId) ?? null,
    },
    $executeRaw: async () => 1,
    $transaction: async (fn: any) => fn(prisma),
  };

  const ledgerSvc: any = {
    debitCoins: async (
      _tx: any,
      _u: bigint,
      amount: bigint,
      type: string,
      _t: string,
      ref: string,
    ) => {
      if (wallet < amount)
        throw Object.assign(new Error('INSUFFICIENT_BALANCE'), {
          code: 'INSUFFICIENT_BALANCE',
        });
      wallet -= amount;
      ledger.push({ type, amount: -amount, ref });
    },
    creditCoins: async (
      _tx: any,
      _u: bigint,
      amount: bigint,
      type: string,
      _t: string,
      ref: string,
    ) => {
      wallet += amount;
      ledger.push({ type, amount, ref });
    },
    writeLedger: async (_tx: any, p: any) =>
      ledger.push({ type: p.type, amount: 0n }),
  };
  const fcm: any = {
    sendUserNotification: async (n: any) => notes.push(n.title),
  };

  const svc = new SvipService(prisma, ledgerSvc, fcm);
  const recharge = (amountInr: number, daysAgo = 0, paymentSource = 'RAZORPAY') =>
    void recharges.push({
      id: nextRecharge++,
      userId: USER,
      status: 'success',
      paymentSource,
      currency: 'INR',
      amountMinor: amountInr * 100,
      createdAt: new Date(Date.now() - daysAgo * DAY),
    });

  return {
    svc,
    recharge,
    spends,
    /** Unlocks `level` the way a player does: pays its recharge amount, then the sweep runs. */
    activate: async (level: number) => {
      recharge(level === 1 ? 500 : 1500);
      return svc.syncFromRecharges(USER);
    },
    get wallet() {
      return wallet;
    },
    set wallet(v: bigint) {
      wallet = v;
    },
    get member() {
      return member;
    },
    setPeriodEnd(at: Date) {
      member.periodEndsAt = at;
    },
    user,
    frameUnlock: () => unlocks.get('50'),
    ledger,
    notes,
  };
}

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e: any) {
    return e.getResponse?.().error?.code ?? e.message;
  }
};

describe('SvipService recharge unlock', () => {
  it('Rs 500 in one go unlocks SVIP 1 for 30 days, no coins taken', async () => {
    const w = makeWorld({ wallet: 100n });
    expect(await w.activate(1)).toBe(true);
    expect(w.member).toMatchObject({ level: 1, status: 'active' });
    expect((w.member.periodEndsAt.getTime() - w.member.periodStartsAt.getTime()) / DAY).toBe(30);
    expect(w.wallet).toBe(100n);
    expect(w.ledger).toHaveLength(0);
    expect(w.notes).toEqual(['SVIP 1 unlocked']);
    const center = await w.svc.center(USER);
    expect(center.me).toMatchObject({ level: 1, status: 'active', maintenance_fee: 1_200_000 });
  });

  it('five recharges of Rs 100 inside 5 days unlock it; an older one does not count', async () => {
    const w = makeWorld({ wallet: 0n });
    for (const daysAgo of [4, 3, 2, 1]) w.recharge(100, daysAgo);
    expect(await w.svc.syncFromRecharges(USER)).toBe(false); // only 400 so far
    w.recharge(100, 0);
    expect(await w.svc.syncFromRecharges(USER)).toBe(true);
    expect(w.member.level).toBe(1);

    const late = makeWorld({ wallet: 0n });
    late.recharge(100, 6); // outside the 5-day window
    for (const daysAgo of [3, 2, 1, 0]) late.recharge(100, daysAgo);
    expect(await late.svc.syncFromRecharges(USER)).toBe(false);
  });

  it('a recharge is never counted twice', async () => {
    const w = makeWorld({ wallet: 0n });
    await w.activate(1);
    const end = w.member.periodEndsAt.getTime();
    expect(await w.svc.syncFromRecharges(USER)).toBe(false);
    expect(w.member.periodEndsAt.getTime()).toBe(end);
    expect(w.spends).toEqual([{ userId: USER, purchaseId: 1n, amountInr: 500, level: 1, kind: 'buy' }]);
  });

  it('only real-money recharges count', async () => {
    const w = makeWorld({ wallet: 0n });
    w.recharge(500, 0, 'EARNINGS_WALLET');
    w.recharge(500, 0, 'MOCK');
    expect(await w.svc.syncFromRecharges(USER)).toBe(false);
    expect(w.member).toBeNull();
  });

  it('upgrades for the difference and keeps the period; the old recharge is not reused', async () => {
    const w = makeWorld({ wallet: 0n });
    await w.activate(1);
    const end = w.member.periodEndsAt.getTime();
    w.recharge(900);
    expect(await w.svc.syncFromRecharges(USER)).toBe(false); // 900 < 1000 difference
    w.recharge(100);
    expect(await w.svc.syncFromRecharges(USER)).toBe(true);
    expect(w.member.level).toBe(2);
    expect(w.member.periodEndsAt.getTime()).toBe(end);
    expect(w.notes).toEqual(['SVIP 1 unlocked', 'Upgraded to SVIP 2']);
  });

  it('does nothing while switched off', async () => {
    const w = makeWorld({ wallet: 0n, enabled: false });
    expect(await w.activate(1)).toBe(false);
    expect(w.member).toBeNull();
  });
});

describe('SvipService renewals', () => {
  it('renews with coins in the last days: 20% fee, continues from the old end date', async () => {
    const w = makeWorld({ wallet: 2_000_000n });
    await w.activate(1);
    const end = new Date(Date.now() + 2 * DAY);
    w.setPeriodEnd(end);
    await w.svc.renew(USER);
    expect(w.wallet).toBe(800_000n);
    expect(w.ledger[0]).toMatchObject({ type: 'SVIP_MAINTENANCE', amount: -1_200_000n });
    expect(w.member.periodEndsAt.getTime()).toBe(end.getTime() + 30 * DAY);
  });

  it('is too early before the last days; short of coins is refused', async () => {
    const w = makeWorld({ wallet: 2_000_000n });
    await w.activate(1);
    expect(await code(w.svc.renew(USER))).toBe('NOT_DUE');
    w.setPeriodEnd(new Date(Date.now() + 2 * DAY));
    w.wallet = 10n;
    expect(await code(w.svc.renew(USER))).toBe('INSUFFICIENT_BALANCE');
    expect(w.wallet).toBe(10n);
  });

  it('renews with a fresh Rs 500 recharge once the period is near its end', async () => {
    const w = makeWorld({ wallet: 0n });
    await w.activate(1);
    w.recharge(500);
    expect(await w.svc.syncFromRecharges(USER)).toBe(false); // far from the end: credit waits
    const end = new Date(Date.now() + 3 * DAY);
    w.setPeriodEnd(end);
    expect(await w.svc.syncFromRecharges(USER)).toBe(true);
    expect(w.member.periodEndsAt.getTime()).toBe(end.getTime() + 30 * DAY);
    expect(w.notes[w.notes.length - 1]).toBe('SVIP renewed');
  });

  it('nothing is ever charged automatically; grace keeps the level, a manual renew works', async () => {
    const w = makeWorld({ wallet: 6_000_000n });
    await w.activate(1);
    w.setPeriodEnd(new Date(Date.now() - DAY));
    expect(await w.svc.renewOne(USER, new Date(), false)).toBe('not_due');
    expect(w.wallet).toBe(6_000_000n);
    expect(await w.svc.levelOf(USER)).toBe(1);
    await w.svc.renew(USER);
    expect(w.member.status).toBe('active');
    expect(w.wallet).toBe(4_800_000n);
  });

  it('a recharge renews a member in grace', async () => {
    const w = makeWorld({ wallet: 0n });
    await w.activate(1);
    const end = new Date(Date.now() - DAY);
    w.setPeriodEnd(end);
    w.recharge(500);
    expect(await w.svc.syncFromRecharges(USER)).toBe(true);
    expect(w.member.periodEndsAt.getTime()).toBe(end.getTime() + 30 * DAY);
  });

  it('after the grace days the sweep ends it and a new recharge unlocks it again', async () => {
    const w = makeWorld({ wallet: 6_000_000n });
    await w.activate(1);
    w.setPeriodEnd(new Date(Date.now() - 4 * DAY));
    expect(await w.svc.renewOne(USER, new Date(), false)).toBe('expired');
    expect(w.member.status).toBe('expired');
    expect(await w.svc.levelOf(USER)).toBe(0);
    expect(w.notes[w.notes.length - 1]).toBe('SVIP ended');
    expect(w.ledger.filter((l) => l.type === 'SVIP_MAINTENANCE')).toHaveLength(0);
    w.recharge(500);
    expect(await w.svc.syncFromRecharges(USER)).toBe(true);
    expect(w.member).toMatchObject({ level: 1, status: 'active' });
  });
});

describe('SvipService monthly claim', () => {
  it('pays the level reward once per month, active members only', async () => {
    const w = makeWorld({ wallet: 0n });
    expect(await code(w.svc.claimMonthly(USER))).toBe('NOT_ACTIVE');
    await w.activate(1);
    const res = await w.svc.claimMonthly(USER);
    expect(res.claimed_amount).toBe(300_000);
    expect(w.wallet).toBe(300_000n);
    expect(await code(w.svc.claimMonthly(USER))).toBe('ALREADY_CLAIMED');
    expect(res.me.monthly_reward).toMatchObject({
      claimed: true,
      can_claim: false,
    });
  });

  it('members in grace cannot claim', async () => {
    const w = makeWorld({ wallet: 6_000_000n });
    await w.activate(1);
    w.setPeriodEnd(new Date(Date.now() - DAY));
    expect(await code(w.svc.claimMonthly(USER))).toBe('NOT_ACTIVE');
  });
});

describe('SvipService identity items', () => {
  it('buying grants and wears the frame + entry bar until period end + grace', async () => {
    const w = makeWorld({ wallet: 7_000_000n });
    await w.activate(1);
    expect(w.user).toMatchObject({
      selectedFrameId: 50n,
      selectedEntryBarId: 60n,
    });
    const u = w.frameUnlock()!;
    expect(u.unlockType).toBe('svip');
    expect(u.expiresAt!.getTime()).toBe(
      w.member.periodEndsAt.getTime() + 3 * DAY,
    );
    expect(w.member).toMatchObject({
      bubbleOn: true,
      roomCardOn: true,
      micWaveOn: true,
    });
  });

  it('renewal extends the frame; expiry takes items off', async () => {
    const w = makeWorld({ wallet: 8_000_000n });
    await w.activate(1);
    w.setPeriodEnd(new Date(Date.now() - 1000));
    await w.svc.renew(USER);
    expect(w.frameUnlock()!.expiresAt!.getTime()).toBe(
      w.member.periodEndsAt.getTime() + 3 * DAY,
    );

    w.setPeriodEnd(new Date(Date.now() - 4 * DAY));
    await w.svc.renewOne(USER, new Date(), false);
    expect(w.frameUnlock()!.expiresAt!.getTime()).toBeLessThanOrEqual(
      Date.now(),
    );
    expect(w.user).toMatchObject({
      selectedFrameId: null,
      selectedEntryBarId: null,
    });
  });

  it('My Items switches items and the frame on / off', async () => {
    const w = makeWorld({ wallet: 7_000_000n });
    const code2 = async (p: Promise<unknown>) =>
      p.then(
        () => 'ok',
        (e: any) => e.getResponse?.().error?.code,
      );
    expect(await code2(w.svc.updateItems(USER, { bubble: false }))).toBe(
      'NOT_ACTIVE',
    );
    await w.activate(1);
    const res = await w.svc.updateItems(USER, { bubble: false, frame: false });
    expect(res).toMatchObject({
      level: 1,
      bubble: false,
      room_card: true,
      mic_wave: true,
      frame: { id: 50, equipped: false },
    });
    expect(w.user.selectedFrameId).toBeNull();
    const back = await w.svc.updateItems(USER, { frame: true });
    expect(back.frame).toEqual({ id: 50, equipped: true });
  });

  it('My Items lists both SVIP 1 bars and wears the one picked', async () => {
    const w = makeWorld({ wallet: 7_000_000n });
    await w.activate(1);
    expect(w.user.selectedEntryBarId).toBe(60n);
    const res = await w.svc.updateItems(USER, { entry_bar_id: 61 });
    expect(w.user.selectedEntryBarId).toBe(61n);
    expect(res.entry_bars.map((b: any) => [b.id, b.equipped, b.media_type])).toEqual([
      [60, false, 'video'],
      [61, true, 'video'],
    ]);
    expect(res.entry_bar).toEqual({ id: 61, equipped: true });
    expect(await code(w.svc.updateItems(USER, { entry_bar_id: 999 }))).toBe(
      'BAR_NOT_AVAILABLE',
    );
  });

  it('the pick survives switching the bar off / on and a renewal', async () => {
    const w = makeWorld({ wallet: 9_000_000n });
    await w.activate(1);
    await w.svc.updateItems(USER, { entry_bar_id: 61 });
    // Switch on while already wearing a level bar keeps it.
    await w.svc.updateItems(USER, { entry_bar: true });
    expect(w.user.selectedEntryBarId).toBe(61n);
    await w.svc.updateItems(USER, { entry_bar: false });
    expect(w.user.selectedEntryBarId).toBeNull();
    // Back on with nothing worn: the default.
    await w.svc.updateItems(USER, { entry_bar: true });
    expect(w.user.selectedEntryBarId).toBe(60n);

    await w.svc.updateItems(USER, { entry_bar_id: 61 });
    w.setPeriodEnd(new Date(Date.now() - 1000));
    await w.svc.renewOne(USER, new Date(), false);
    expect(w.user.selectedEntryBarId).toBe(61n);
  });
});

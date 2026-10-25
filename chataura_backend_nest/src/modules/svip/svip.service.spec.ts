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
  const BAR = { id: 60n, svipLevel: 1 };
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
      purchasePrice: 6_000_000n,
      monthlyReward: 300_000n,
      isActive: true,
    },
    {
      level: 2,
      name: 'SVIP 2',
      purchasePrice: 18_000_000n,
      monthlyReward: 1_080_000n,
      isActive: true,
    },
  ];

  const prisma: any = {
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
      findUniqueOrThrow: async () => ({ walletBalance: wallet, ...user }),
      findUnique: async () => ({ id: USER }),
      update: async ({ data }: any) => Object.assign(user, data),
      updateMany: async ({ where, data }: any) => {
        const hit =
          (where.selectedFrameId !== undefined &&
            user.selectedFrameId === where.selectedFrameId) ||
          (where.selectedEntryBarId !== undefined &&
            user.selectedEntryBarId === where.selectedEntryBarId) ||
          (where.selectedFrame && user.selectedFrameId === FRAME.id) ||
          (where.selectedEntryBar && user.selectedEntryBarId === BAR.id);
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
      findFirst: async ({ where }: any) => (where.svipLevel === 1 ? BAR : null),
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

  return {
    svc: new SvipService(prisma, ledgerSvc, fcm),
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

describe('SvipService purchase', () => {
  it('buys SVIP 1 for the full price and starts a 30-day period', async () => {
    const w = makeWorld({ wallet: 7_000_000n });
    const res = await w.svc.purchase(USER, 1);
    expect(w.wallet).toBe(1_000_000n);
    expect(w.ledger[0]).toMatchObject({
      type: 'SVIP_PURCHASE',
      amount: -6_000_000n,
    });
    expect(res.me).toMatchObject({
      level: 1,
      status: 'active',
      maintenance_fee: 1_200_000,
    });
    const days =
      (w.member.periodEndsAt.getTime() - w.member.periodStartsAt.getTime()) /
      DAY;
    expect(days).toBe(30);
  });

  it('upgrades for the price difference; blocks downgrade and same level', async () => {
    const w = makeWorld({ wallet: 20_000_000n });
    await w.svc.purchase(USER, 1);
    const end = w.member.periodEndsAt.getTime();
    expect(await code(w.svc.purchase(USER, 1))).toBe('ALREADY_ACTIVE');
    await w.svc.purchase(USER, 2);
    expect(w.ledger[1]).toMatchObject({
      type: 'SVIP_UPGRADE',
      amount: -12_000_000n,
    });
    // Same renewal date: upgrading never skips the next maintenance fee.
    expect(w.member.periodEndsAt.getTime()).toBe(end);
    expect(w.member.level).toBe(2);
    expect(await code(w.svc.purchase(USER, 1))).toBe('DOWNGRADE_NOT_ALLOWED');
  });

  it('rejects when short of coins or switched off', async () => {
    expect(await code(makeWorld({ wallet: 10n }).svc.purchase(USER, 1))).toBe(
      'INSUFFICIENT_BALANCE',
    );
    expect(
      await code(
        makeWorld({ wallet: 9e9 as any, enabled: false }).svc.purchase(USER, 1),
      ),
    ).toBe('SVIP_DISABLED');
  });
});

describe('SvipService renewals', () => {
  it('charges 20% at period end and continues from the old end date', async () => {
    const w = makeWorld({ wallet: 8_000_000n });
    await w.svc.purchase(USER, 1);
    const end = new Date(Date.now() - 1000);
    w.setPeriodEnd(end);
    expect(await w.svc.renewOne(USER, new Date(), false)).toBe('renewed');
    expect(w.wallet).toBe(800_000n);
    expect(w.member.periodEndsAt.getTime()).toBe(end.getTime() + 30 * DAY);
    expect(w.notes).toEqual(['SVIP renewed']);
  });

  it('goes to grace when short, keeps the level, then a manual renew works after top-up', async () => {
    const w = makeWorld({ wallet: 6_000_000n });
    await w.svc.purchase(USER, 1);
    w.setPeriodEnd(new Date(Date.now() - DAY));
    expect(await w.svc.renewOne(USER, new Date(), false)).toBe('insufficient');
    expect(w.member.status).toBe('grace');
    expect(await w.svc.levelOf(USER)).toBe(1);
    expect(w.notes).toEqual(['SVIP renewal failed']);
    // second failed attempt does not notify again
    await w.svc.renewOne(USER, new Date(), false);
    expect(w.notes).toHaveLength(1);
    expect(await code(w.svc.purchase(USER, 2))).toBe('RENEW_FIRST');
    w.wallet = 2_000_000n;
    await w.svc.renew(USER);
    expect(w.member.status).toBe('active');
    expect(w.wallet).toBe(800_000n);
  });

  it('expires after the grace days and drops the level', async () => {
    const w = makeWorld({ wallet: 6_000_000n });
    await w.svc.purchase(USER, 1);
    w.setPeriodEnd(new Date(Date.now() - 4 * DAY));
    expect(await w.svc.renewOne(USER, new Date(), false)).toBe('expired');
    expect(w.member.status).toBe('expired');
    expect(await w.svc.levelOf(USER)).toBe(0);
    expect(w.notes).toEqual(['SVIP ended']);
    expect(w.ledger.filter((l) => l.type === 'SVIP_MAINTENANCE')).toHaveLength(
      0,
    );
  });

  it('does not charge before the period ends', async () => {
    const w = makeWorld({ wallet: 9_000_000n });
    await w.svc.purchase(USER, 1);
    expect(await w.svc.renewOne(USER, new Date(), false)).toBe('not_due');
    expect(await code(w.svc.renew(USER))).toBe('NOT_DUE');
  });
});

describe('SvipService monthly claim', () => {
  it('pays the level reward once per month, active members only', async () => {
    const w = makeWorld({ wallet: 6_000_000n });
    expect(await code(w.svc.claimMonthly(USER))).toBe('NOT_ACTIVE');
    await w.svc.purchase(USER, 1);
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
    await w.svc.purchase(USER, 1);
    w.setPeriodEnd(new Date(Date.now() - DAY));
    expect(await code(w.svc.claimMonthly(USER))).toBe('NOT_ACTIVE');
  });
});

describe('SvipService identity items', () => {
  it('buying grants and wears the frame + entry bar until period end + grace', async () => {
    const w = makeWorld({ wallet: 7_000_000n });
    await w.svc.purchase(USER, 1);
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
    await w.svc.purchase(USER, 1);
    w.setPeriodEnd(new Date(Date.now() - 1000));
    await w.svc.renewOne(USER, new Date(), false);
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
    await w.svc.purchase(USER, 1);
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
});

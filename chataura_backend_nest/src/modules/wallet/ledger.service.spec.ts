import { LedgerService, LockedUser } from './ledger.service';

type Row = Record<string, any>;

function lockedUser(overrides: Partial<LockedUser> = {}): LockedUser {
  return {
    id: 10n,
    wallet_balance: 1000n,
    gems: 50n,
    referral_balance: 0n,
    inr_earnings_balance: 0n,
    usd_earnings_balance: 0n,
    xp: 0,
    level: 1,
    role: 'user',
    streak_count: 0,
    last_streak_at: null,
    ...overrides,
  };
}

function fakeTx(extraSettings: Record<string, unknown> = {}) {
  const rows: Row[] = [];
  const userUpdates: Row[] = [];
  const tx = {
    $queryRaw: jest.fn(async () => [lockedUser()]),
    user: {
      update: jest.fn(async ({ data }: Row) => {
        userUpdates.push(data);
        return { walletBalance: 0n };
      }),
    },
    coinTransaction: {
      findFirst: jest.fn(async ({ where }: Row) =>
        rows.find(
          (r) => r.userId === where.userId && r.referenceId === where.referenceId,
        ) ?? null,
      ),
      create: jest.fn(async ({ data }: Row) => {
        rows.push(data);
        return data;
      }),
    },
    adminSetting: {
      findUnique: jest.fn(async () => ({ extraSettings })),
    },
  };
  return { tx: tx as any, rows, userUpdates };
}

describe('LedgerService', () => {
  const ledger = new LedgerService({} as any);

  describe('single coin column', () => {
    it('credit touches only wallet_balance', async () => {
      const { tx, userUpdates, rows } = fakeTx();
      const after = await ledger.creditCoins(tx, 10n, 200, 'ADMIN_CREDIT', 't', 'ref1', lockedUser());
      expect(after).toBe(1200n);
      expect(userUpdates).toEqual([{ walletBalance: { increment: 200n } }]);
      expect(rows[0]).toMatchObject({ type: 'ADMIN_CREDIT', coinAmount: 200n, balanceAfter: 1200n });
    });

    it('debit without xpSource (admin deduct) touches only wallet_balance and grants no XP', async () => {
      const { tx, userUpdates, rows } = fakeTx();
      const res = await ledger.debitCoins(tx, 10n, 300, 'ADMIN_DEBIT', 't', 'ref2', lockedUser());
      expect(res.after).toBe(700n);
      expect(userUpdates).toEqual([{ walletBalance: { decrement: 300n } }]);
      expect(rows).toHaveLength(1);
      expect(rows.some((r) => r.type === 'XP')).toBe(false);
    });

    it('credit with an existing reference is not applied twice', async () => {
      const { tx, userUpdates } = fakeTx();
      await ledger.creditCoins(tx, 10n, 100, 'RECHARGE', 't', 'pay_1', lockedUser());
      await ledger.creditCoins(tx, 10n, 100, 'RECHARGE', 't', 'pay_1', lockedUser());
      expect(userUpdates).toHaveLength(1);
    });
  });

  describe('recordGiftGems', () => {
    it('writes a zero-coin GIFT_RECEIVED row with gem details', async () => {
      const { tx, rows } = fakeTx();
      await ledger.recordGiftGems(tx, {
        receiverId: 20n,
        senderId: 10n,
        giftId: 5n,
        gems: 80n,
        gemsAfter: 130n,
        commission: 20n,
        referenceId: 'gift_ref',
        source: 'room_gift',
        roomId: 'room-1',
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        userId: 20n,
        type: 'GIFT_RECEIVED',
        coinAmount: 0n,
        referenceId: 'gift_ref_recv_20',
      });
      expect(rows[0].meta).toMatchObject({ currency: 'gems', gems_delta: 80, gems_after: 130, sender_id: 10 });
    });

    it('is idempotent per gift reference', async () => {
      const { tx, rows } = fakeTx();
      const params = {
        receiverId: 20n, senderId: 10n, giftId: 5n, gems: 80n, gemsAfter: 130n,
        commission: 20n, referenceId: 'gift_ref', source: 'room_gift',
      };
      await ledger.recordGiftGems(tx, params);
      await ledger.recordGiftGems(tx, params);
      expect(rows).toHaveLength(1);
    });
  });

  describe('applyLuckyGiftRebate', () => {
    const base = {
      senderId: 10n,
      giftId: 7n,
      giftCost: 20_000n,
      referenceId: 'gift_ref',
    };

    it('does nothing for non-lucky gifts', async () => {
      const { tx, rows } = fakeTx();
      const res = await ledger.applyLuckyGiftRebate(tx, {
        ...base, giftCategory: 'standard', senderLock: lockedUser(),
      });
      expect(res).toBeNull();
      expect(rows).toHaveLength(0);
    });

    it('returns 1-40% of the gift value by default', async () => {
      for (let i = 0; i < 200; i++) {
        const { tx, rows } = fakeTx();
        const res = await ledger.applyLuckyGiftRebate(tx, {
          ...base, giftCategory: 'lucky', senderLock: lockedUser(),
        });
        expect(res).not.toBeNull();
        expect(res!.pct).toBeGreaterThanOrEqual(1);
        expect(res!.pct).toBeLessThanOrEqual(40);
        expect(res!.coins).toBe(Math.floor((20_000 * res!.pct) / 100));
        expect(res!.balanceAfter).toBe(1000n + BigInt(res!.coins));
        expect(rows[0]).toMatchObject({
          type: 'LUCKY_GIFT_REBATE',
          referenceId: 'gift_ref_lucky',
          coinAmount: BigInt(res!.coins),
        });
      }
    });

    it('uses the admin-configured range and tolerates min > max', async () => {
      const { tx } = fakeTx({ lucky_rebate_min_pct: 25, lucky_rebate_max_pct: 25 });
      const res = await ledger.applyLuckyGiftRebate(tx, {
        ...base, giftCategory: 'LUCKY', senderLock: lockedUser(),
      });
      expect(res!.pct).toBe(25);
      expect(res!.coins).toBe(5_000);

      const swapped = fakeTx({ lucky_rebate_min_pct: 30, lucky_rebate_max_pct: 10 });
      const res2 = await ledger.applyLuckyGiftRebate(swapped.tx, {
        ...base, giftCategory: 'lucky', senderLock: lockedUser(),
      });
      expect(res2!.pct).toBeGreaterThanOrEqual(10);
      expect(res2!.pct).toBeLessThanOrEqual(30);
    });

    it('never pays the same gift twice', async () => {
      const { tx, userUpdates } = fakeTx();
      await ledger.applyLuckyGiftRebate(tx, { ...base, giftCategory: 'lucky', senderLock: lockedUser() });
      await ledger.applyLuckyGiftRebate(tx, { ...base, giftCategory: 'lucky', senderLock: lockedUser() });
      expect(userUpdates).toHaveLength(1);
    });
  });
});

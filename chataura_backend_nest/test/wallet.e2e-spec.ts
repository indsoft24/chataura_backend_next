import { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  authHeader,
  createTestApp,
  creditCoins,
  firstGiftId,
  mockRecharge,
  parse,
  prisma,
  registerVerified,
  setRole,
} from './e2e.helpers';

describe('Wallet (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('packages + mock recharge + gems to coins + withdraw disabled', async () => {
    const sender = await registerVerified(app);
    const receiver = await registerVerified(app);

    const packages = await app.inject({
      method: 'GET',
      url: '/api/v1/wallet/packages',
      headers: authHeader(sender.token),
    });
    const pkgBody = parse<{ packages: Array<{ id: number }> }>(
      packages.payload,
    );
    expect(pkgBody.success).toBe(true);
    expect(Array.isArray(pkgBody.data?.packages)).toBe(true);

    const recharge = await mockRecharge(app, sender.token);
    expect(recharge.success).toBe(true);
    expect(
      (recharge.data as { wallet_balance?: number })?.wallet_balance,
    ).toBeGreaterThan(0);

    await creditCoins(sender.id, 200);
    const giftId = await firstGiftId();
    const gift = await app.inject({
      method: 'POST',
      url: '/api/v1/wallet/send-gift',
      headers: authHeader(sender.token),
      payload: { gift_id: giftId, receiver_id: receiver.id },
    });
    const gifted = parse<{
      sender_balance_after: number;
      receiver_gems_after: number;
    }>(gift.payload);
    expect(gifted.success).toBe(true);
    expect(gifted.data!.sender_balance_after).toBeGreaterThanOrEqual(0);
    expect(gifted.data!.receiver_gems_after).toBeGreaterThan(0);

    await prisma.user.update({
      where: { id: BigInt(receiver.id) },
      data: { gems: { increment: 20n } },
    });
    const convert = await app.inject({
      method: 'POST',
      url: '/api/v1/wallet/gems/convert',
      headers: authHeader(receiver.token),
      payload: { gems_amount: 10, currency: 'COINS' },
    });
    expect(parse(convert.payload).success).toBe(true);

    const withdraw = await app.inject({
      method: 'POST',
      url: '/api/v1/wallet/withdraw',
      headers: authHeader(sender.token),
      payload: { amount: 10, currency: 'INR' },
    });
    expect(withdraw.statusCode).toBe(403);
    expect(parse(withdraw.payload).error?.code).toBe('CASH_OUT_DISABLED');

    const canCall = await app.inject({
      method: 'GET',
      url: `/api/v1/wallet/can-call/${receiver.id}/audio`,
      headers: authHeader(sender.token),
    });
    const callBody = parse<{ can_call: boolean }>(canCall.payload);
    expect(callBody.success).toBe(true);
    expect(callBody.data?.can_call).toBe(false);
  });

  it('50 concurrent gift debits never go negative and ledger matches successes', async () => {
    const sender = await registerVerified(app);
    const receiver = await registerVerified(app);
    const giftId = await firstGiftId();
    const gift = await prisma.gift.findUniqueOrThrow({
      where: { id: BigInt(giftId) },
    });
    const cost = gift.coinCost;
    await creditCoins(sender.id, cost * 50);

    const beforeTx = await prisma.coinTransaction.count({
      where: { userId: BigInt(sender.id), type: 'GIFT', coinAmount: { lt: 0 } },
    });

    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        app.inject({
          method: 'POST',
          url: '/api/v1/wallet/send-gift',
          headers: authHeader(sender.token),
          payload: { gift_id: giftId, receiver_id: receiver.id },
        }),
      ),
    );
    const successes = results.filter((r) => {
      const body = parse(r.payload);
      return r.statusCode < 400 && body.success === true;
    });
    expect(successes.length).toBeGreaterThan(0);

    const wallet = await prisma.user.findUniqueOrThrow({
      where: { id: BigInt(sender.id) },
    });
    expect(wallet.walletBalance >= 0n).toBe(true);
    expect(wallet.coinBalance >= 0n).toBe(true);

    const afterTx = await prisma.coinTransaction.count({
      where: { userId: BigInt(sender.id), type: 'GIFT', coinAmount: { lt: 0 } },
    });
    expect(afterTx - beforeTx).toBe(successes.length);
  });

  it('reciprocal concurrent seller transfers execute without deadlocks', async () => {
    const sellerA = await registerVerified(app);
    const sellerB = await registerVerified(app);
    await setRole(sellerA.id, 'seller');
    await setRole(sellerB.id, 'seller');
    await creditCoins(sellerA.id, 100_000);
    await creditCoins(sellerB.id, 100_000);

    // Prevent self-transfer
    const selfRes = await app.inject({
      method: 'POST',
      url: '/api/v1/wallet/transfer',
      headers: authHeader(sellerA.token),
      payload: { receiver_id: sellerA.id, coin_amount: 1000 },
    });
    expect(selfRes.statusCode).toBe(400);
    expect(parse(selfRes.payload).error?.code).toBe('SELF_TRANSFER_FORBIDDEN');

    const initialA = (
      await prisma.user.findUniqueOrThrow({ where: { id: BigInt(sellerA.id) } })
    ).walletBalance;
    const initialB = (
      await prisma.user.findUniqueOrThrow({ where: { id: BigInt(sellerB.id) } })
    ).walletBalance;

    // Fire 100 reciprocal transfers concurrently (50 A->B and 50 B->A)
    const transfers = [];
    for (let i = 0; i < 50; i++) {
      transfers.push(
        app.inject({
          method: 'POST',
          url: '/api/v1/wallet/transfer',
          headers: authHeader(sellerA.token),
          payload: { receiver_id: sellerB.id, coin_amount: 1000 },
        }),
        app.inject({
          method: 'POST',
          url: '/api/v1/wallet/transfer',
          headers: authHeader(sellerB.token),
          payload: { receiver_id: sellerA.id, coin_amount: 1000 },
        }),
      );
    }

    const results = await Promise.all(transfers);

    // Assert ALL 100 transfers succeeded with NO deadlock errors (status < 400)
    expect(results).toHaveLength(100);
    for (const res of results) {
      expect(res.statusCode).toBeLessThan(400);
      expect(parse(res.payload).success).toBe(true);
    }

    // Since 50 * 1000 went from A to B and 50 * 1000 went from B to A:
    const walletA = await prisma.user.findUniqueOrThrow({
      where: { id: BigInt(sellerA.id) },
    });
    const walletB = await prisma.user.findUniqueOrThrow({
      where: { id: BigInt(sellerB.id) },
    });
    expect(walletA.walletBalance).toBe(initialA);
    expect(walletB.walletBalance).toBe(initialB);

    // Verify ledger entries reconcile exactly
    const txA = await prisma.coinTransaction.findMany({
      where: { userId: BigInt(sellerA.id), type: 'SELLER_TRANSFER' },
    });
    const txB = await prisma.coinTransaction.findMany({
      where: { userId: BigInt(sellerB.id), type: 'SELLER_TRANSFER' },
    });
    // 50 sends (-1000) and 50 receives (+1000) for each seller
    expect(txA).toHaveLength(100);
    expect(txB).toHaveLength(100);
    const sumA = txA.reduce((sum, t) => sum + Number(t.coinAmount), 0);
    const sumB = txB.reduce((sum, t) => sum + Number(t.coinAmount), 0);
    expect(sumA).toBe(0);
    expect(sumB).toBe(0);
  });

  it('reciprocal concurrent direct gifts execute without deadlocks', async () => {
    const userA = await registerVerified(app);
    const userB = await registerVerified(app);
    const giftId = await firstGiftId();
    const gift = await prisma.gift.findUniqueOrThrow({
      where: { id: BigInt(giftId) },
    });
    const cost = gift.coinCost;
    await creditCoins(userA.id, cost * 10);
    await creditCoins(userB.id, cost * 10);

    // Fire 10 reciprocal gifts concurrently (5 A->B and 5 B->A)
    const gifts = [];
    for (let i = 0; i < 5; i++) {
      gifts.push(
        app.inject({
          method: 'POST',
          url: '/api/v1/wallet/send-gift',
          headers: authHeader(userA.token),
          payload: { gift_id: giftId, receiver_id: userB.id },
        }),
        app.inject({
          method: 'POST',
          url: '/api/v1/wallet/send-gift',
          headers: authHeader(userB.token),
          payload: { gift_id: giftId, receiver_id: userA.id },
        }),
      );
    }

    const results = await Promise.all(gifts);

    // Zero deadlocks
    for (const res of results) {
      expect(res.statusCode).toBeLessThan(400);
      expect(parse(res.payload).success).toBe(true);
    }
  });
});

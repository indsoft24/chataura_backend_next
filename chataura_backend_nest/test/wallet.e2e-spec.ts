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
    const pkgBody = parse<{ packages: Array<{ id: number }> }>(packages.payload);
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
});

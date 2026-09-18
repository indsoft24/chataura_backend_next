import { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  authHeader,
  createTestApp,
  creditCoins,
  firstGiftId,
  parse,
  prisma,
  registerVerified,
} from './e2e.helpers';

describe('Rooms (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('create → join empty body → seats → heartbeat → gift → kick/block → leave', async () => {
    const host = await registerVerified(app, { name: 'Host' });
    const audience = await registerVerified(app, { name: 'Audience' });
    await creditCoins(host.id, 10000);

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/rooms',
      headers: authHeader(host.token),
      payload: { title: `P6 Room ${Date.now()}`, max_seats: 8 },
    });
    const room = parse<{ id: string }>(created.payload);
    expect(room.success).toBe(true);
    const roomId = room.data!.id;

    const hostJoin = await app.inject({
      method: 'POST',
      url: `/api/v1/rooms/${roomId}/join`,
      headers: authHeader(host.token),
      payload: {},
    });
    expect(parse(hostJoin.payload).success).toBe(true);

    const audJoin = await app.inject({
      method: 'POST',
      url: `/api/v1/rooms/${roomId}/join`,
      headers: {
        ...authHeader(audience.token),
        'content-type': 'application/json',
      },
      payload: '',
    });
    expect(parse(audJoin.payload).success).toBe(true);

    const takeHost = await app.inject({
      method: 'POST',
      url: `/api/v1/rooms/${roomId}/seats/1/take`,
      headers: authHeader(host.token),
      payload: {},
    });
    expect(parse(takeHost.payload).success).toBe(true);

    const takeAud = await app.inject({
      method: 'POST',
      url: `/api/v1/rooms/${roomId}/seats/2/take`,
      headers: authHeader(audience.token),
      payload: {},
    });
    expect(takeAud.statusCode).toBe(403);
    expect(parse(takeAud.payload).error?.code).toBe('FORBIDDEN');

    const assign = await app.inject({
      method: 'POST',
      url: `/api/v1/rooms/${roomId}/seats/2/assign`,
      headers: authHeader(host.token),
      payload: { user_id: audience.id },
    });
    expect(parse(assign.payload).success).toBe(true);

    const mute = await app.inject({
      method: 'PATCH',
      url: `/api/v1/rooms/${roomId}/seats/2/mute`,
      headers: authHeader(host.token),
      payload: { muted: true },
    });
    expect(parse(mute.payload).success).toBe(true);

    const hb = await app.inject({
      method: 'POST',
      url: `/api/v1/rooms/${roomId}/heartbeat`,
      headers: authHeader(host.token),
      payload: {},
    });
    expect(parse(hb.payload).success).toBe(true);

    const giftId = await firstGiftId();
    const gift = await app.inject({
      method: 'POST',
      url: `/api/v1/rooms/${roomId}/gifts/send`,
      headers: authHeader(host.token),
      payload: { gift_id: giftId, receiver_id: audience.id },
    });
    expect(parse(gift.payload).success).toBe(true);

    const stats = await app.inject({
      method: 'GET',
      url: `/api/v1/rooms/${roomId}/gifts/stats`,
      headers: authHeader(host.token),
    });
    const statsBody = parse<{
      total_coins: number;
      senders: Array<{ user_id: number }>;
    }>(stats.payload);
    expect(statsBody.success).toBe(true);
    expect(statsBody.data?.senders.some((s) => s.user_id === host.id)).toBe(
      true,
    );

    const recvGifts = await app.inject({
      method: 'GET',
      url: `/api/v1/users/${audience.id}/gifts`,
      headers: authHeader(audience.token),
    });
    expect(parse(recvGifts.payload).success).toBe(true);

    const sentGifts = await app.inject({
      method: 'GET',
      url: `/api/v1/users/${host.id}/gifts/sent`,
      headers: authHeader(host.token),
    });
    expect(parse(sentGifts.payload).success).toBe(true);

    const block = await app.inject({
      method: 'POST',
      url: `/api/v1/rooms/${roomId}/block`,
      headers: authHeader(host.token),
      payload: { user_id: audience.id },
    });
    expect(parse(block.payload).success).toBe(true);

    const blocked = await app.inject({
      method: 'GET',
      url: `/api/v1/rooms/${roomId}/blocked-users`,
      headers: authHeader(host.token),
    });
    const list = parse<Array<{ user_id: number }>>(blocked.payload);
    expect(list.success).toBe(true);
    expect(list.data?.some((u) => u.user_id === audience.id)).toBe(true);

    const leave = await app.inject({
      method: 'POST',
      url: `/api/v1/rooms/${roomId}/leave`,
      headers: authHeader(host.token),
      payload: {},
    });
    expect(parse(leave.payload).success).toBe(true);
  });

  it('host transfer stays on successor when original host rejoins', async () => {
    const owner = await registerVerified(app, { name: 'Owner' });
    const successor = await registerVerified(app, { name: 'Successor' });

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/rooms',
      headers: authHeader(owner.token),
      payload: { title: `Host persist ${Date.now()}`, max_seats: 8 },
    });
    const roomId = parse<{ id: string }>(created.payload).data!.id;

    await app.inject({
      method: 'POST',
      url: `/api/v1/rooms/${roomId}/join`,
      headers: authHeader(owner.token),
      payload: {},
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/rooms/${roomId}/join`,
      headers: authHeader(successor.token),
      payload: {},
    });

    const transfer = await app.inject({
      method: 'POST',
      url: `/api/v1/rooms/${roomId}/transfer-host`,
      headers: authHeader(owner.token),
      payload: { user_id: successor.id },
    });
    expect(parse(transfer.payload).success).toBe(true);

    await app.inject({
      method: 'POST',
      url: `/api/v1/rooms/${roomId}/leave`,
      headers: authHeader(owner.token),
      payload: {},
    });

    const rejoin = await app.inject({
      method: 'POST',
      url: `/api/v1/rooms/${roomId}/join`,
      headers: authHeader(owner.token),
      payload: {},
    });
    const joined = parse<{ room?: { host_id?: number } }>(rejoin.payload);
    expect(joined.success).toBe(true);
    expect(joined.data?.room?.host_id).toBe(successor.id);
  });

  it('sendBatchGift delivers to all occupants atomically', async () => {
    const host = await registerVerified(app, { name: 'BatchHost' });
    const aud1 = await registerVerified(app, { name: 'BatchAud1' });
    const aud2 = await registerVerified(app, { name: 'BatchAud2' });

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/rooms',
      headers: authHeader(host.token),
      payload: { title: `Batch Gift Room ${Date.now()}`, max_seats: 8 },
    });
    const roomId = parse<{ id: string }>(created.payload).data!.id;

    await app.inject({
      method: 'POST',
      url: `/api/v1/rooms/${roomId}/join`,
      headers: authHeader(host.token),
      payload: {},
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/rooms/${roomId}/join`,
      headers: authHeader(aud1.token),
      payload: {},
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/rooms/${roomId}/join`,
      headers: authHeader(aud2.token),
      payload: {},
    });

    const giftId = await firstGiftId();
    const gift = await prisma.gift.findUniqueOrThrow({
      where: { id: BigInt(giftId) },
    });
    const cost = gift.coinCost;
    await creditCoins(host.id, cost * 10);

    const initialHostBal = (
      await prisma.user.findUniqueOrThrow({ where: { id: BigInt(host.id) } })
    ).walletBalance;
    const initialAud1Gems = (
      await prisma.user.findUniqueOrThrow({ where: { id: BigInt(aud1.id) } })
    ).gems;
    const initialAud2Gems = (
      await prisma.user.findUniqueOrThrow({ where: { id: BigInt(aud2.id) } })
    ).gems;

    const batchRes = await app.inject({
      method: 'POST',
      url: '/api/v1/gifts/send-batch',
      headers: authHeader(host.token),
      payload: {
        gift_id: giftId,
        receiver_ids: [aud1.id, aud2.id],
        quantity: 1,
        room_id: roomId,
      },
    });

    const body = parse<{
      coin_amount: number;
      receiver_count: number;
      sender_balance_after: number;
    }>(batchRes.payload);

    expect(batchRes.statusCode).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data?.receiver_count).toBe(2);
    expect(body.data?.coin_amount).toBe(cost * 2);

    const afterHost = await prisma.user.findUniqueOrThrow({
      where: { id: BigInt(host.id) },
    });
    expect(afterHost.walletBalance).toBe(initialHostBal - BigInt(cost * 2));

    const afterAud1 = await prisma.user.findUniqueOrThrow({
      where: { id: BigInt(aud1.id) },
    });
    const afterAud2 = await prisma.user.findUniqueOrThrow({
      where: { id: BigInt(aud2.id) },
    });
    expect(afterAud1.gems).toBeGreaterThan(initialAud1Gems);
    expect(afterAud2.gems).toBeGreaterThan(initialAud2Gems);
  });

  it('sendBatchGift with insufficient balance rolls back completely without partial delivery', async () => {
    const host = await registerVerified(app, { name: 'PoorHost' });
    const aud1 = await registerVerified(app, { name: 'Aud1' });
    const aud2 = await registerVerified(app, { name: 'Aud2' });

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/rooms',
      headers: authHeader(host.token),
      payload: { title: `Fail Room ${Date.now()}`, max_seats: 8 },
    });
    const roomId = parse<{ id: string }>(created.payload).data!.id;

    await app.inject({
      method: 'POST',
      url: `/api/v1/rooms/${roomId}/join`,
      headers: authHeader(host.token),
      payload: {},
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/rooms/${roomId}/join`,
      headers: authHeader(aud1.token),
      payload: {},
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/rooms/${roomId}/join`,
      headers: authHeader(aud2.token),
      payload: {},
    });

    const giftId = await firstGiftId();
    const gift = await prisma.gift.findUniqueOrThrow({
      where: { id: BigInt(giftId) },
    });
    const cost = gift.coinCost;

    // Credit only enough for 1 gift, but trying to send to 2 receivers
    await creditCoins(host.id, cost);

    const initialHostBal = (
      await prisma.user.findUniqueOrThrow({ where: { id: BigInt(host.id) } })
    ).walletBalance;
    const initialAud1Gems = (
      await prisma.user.findUniqueOrThrow({ where: { id: BigInt(aud1.id) } })
    ).gems;
    const initialAud2Gems = (
      await prisma.user.findUniqueOrThrow({ where: { id: BigInt(aud2.id) } })
    ).gems;

    const batchRes = await app.inject({
      method: 'POST',
      url: '/api/v1/gifts/send-batch',
      headers: authHeader(host.token),
      payload: {
        gift_id: giftId,
        receiver_ids: [aud1.id, aud2.id],
        quantity: 1,
        room_id: roomId,
      },
    });

    expect(batchRes.statusCode).toBe(400);
    expect(parse(batchRes.payload).error?.code).toBe('INSUFFICIENT_BALANCE');

    // Verify COMPLETE ROLLBACK: host was not charged for even 1 gift, and aud1/aud2 got 0 gems
    const afterHost = await prisma.user.findUniqueOrThrow({
      where: { id: BigInt(host.id) },
    });
    expect(afterHost.walletBalance).toBe(initialHostBal);

    const afterAud1 = await prisma.user.findUniqueOrThrow({
      where: { id: BigInt(aud1.id) },
    });
    const afterAud2 = await prisma.user.findUniqueOrThrow({
      where: { id: BigInt(aud2.id) },
    });
    expect(afterAud1.gems).toBe(initialAud1Gems);
    expect(afterAud2.gems).toBe(initialAud2Gems);
  });

  it('sendBatchGift atomicity: 400 coins fails 5x100 batch, 500 coins succeeds, reconciles ledger, handles duplicates', async () => {
    const sender = await registerVerified(app, { name: 'BatchSender' });
    const recipients = await Promise.all([
      registerVerified(app, { name: 'Recv1' }),
      registerVerified(app, { name: 'Recv2' }),
      registerVerified(app, { name: 'Recv3' }),
      registerVerified(app, { name: 'Recv4' }),
      registerVerified(app, { name: 'Recv5' }),
    ]);

    // Create a 100-coin gift for deterministic math
    const gift = await prisma.gift.create({
      data: {
        name: `AtomicityGift_${Date.now()}`,
        coinCost: 100,
        isActive: true,
      },
    });

    const roomRes = await app.inject({
      method: 'POST',
      url: '/api/v1/rooms',
      headers: authHeader(sender.token),
      payload: { title: `Batch Room ${Date.now()}`, max_seats: 8 },
    });
    const roomId = parse<{ id: string }>(roomRes.payload).data!.id;

    // Join all participants to the room
    await app.inject({
      method: 'POST',
      url: `/api/v1/rooms/${roomId}/join`,
      headers: authHeader(sender.token),
      payload: {},
    });
    for (const r of recipients) {
      await app.inject({
        method: 'POST',
        url: `/api/v1/rooms/${roomId}/join`,
        headers: authHeader(r.token),
        payload: {},
      });
    }

    // Step A: Sender has 400 coins, tries to gift 5 recipients @ 100 coins each (total 500)
    await prisma.user.update({
      where: { id: BigInt(sender.id) },
      data: { walletBalance: 400n, coinBalance: 400n },
    });

    const initialSenderBal = (
      await prisma.user.findUniqueOrThrow({ where: { id: BigInt(sender.id) } })
    ).walletBalance;
    expect(initialSenderBal).toBe(400n);

    const initialGems = await Promise.all(
      recipients.map(async (r) =>
        (await prisma.user.findUniqueOrThrow({ where: { id: BigInt(r.id) } })).gems,
      ),
    );

    const failRes = await app.inject({
      method: 'POST',
      url: '/api/v1/gifts/send-batch',
      headers: authHeader(sender.token),
      payload: {
        gift_id: Number(gift.id),
        receiver_ids: recipients.map((r) => r.id),
        quantity: 1,
        room_id: roomId,
      },
    });

    expect(failRes.statusCode).toBe(400);
    expect(parse(failRes.payload).error?.code).toBe('INSUFFICIENT_BALANCE');

    // Verify atomic failure: sender balance remains 400, recipients remain untouched, 0 ledger records
    const senderBalAfterFail = (
      await prisma.user.findUniqueOrThrow({ where: { id: BigInt(sender.id) } })
    ).walletBalance;
    expect(senderBalAfterFail).toBe(400n);

    for (let i = 0; i < recipients.length; i++) {
      const g = (
        await prisma.user.findUniqueOrThrow({
          where: { id: BigInt(recipients[i].id) },
        })
      ).gems;
      expect(g).toBe(initialGems[i]);
    }

    const failedLedgerRows = await prisma.coinTransaction.findMany({
      where: {
        userId: BigInt(sender.id),
        type: 'GIFT',
        meta: { path: ['gift_id'], equals: Number(gift.id) },
      },
    });
    expect(failedLedgerRows).toHaveLength(0);

    // Step B: Sender credited 100 more coins -> balance = 500 coins. Re-attempt same batch.
    await creditCoins(sender.id, 100);
    const readySenderBal = (
      await prisma.user.findUniqueOrThrow({ where: { id: BigInt(sender.id) } })
    ).walletBalance;
    expect(readySenderBal).toBe(500n);

    const successRes = await app.inject({
      method: 'POST',
      url: '/api/v1/gifts/send-batch',
      headers: authHeader(sender.token),
      payload: {
        gift_id: Number(gift.id),
        receiver_ids: recipients.map((r) => r.id),
        quantity: 1,
        room_id: roomId,
      },
    });

    expect(successRes.statusCode).toBe(201);
    const successBody = parse<{
      coin_amount: number;
      per_receiver_coin_amount: number;
      receiver_count: number;
      sender_balance_after: number;
    }>(successRes.payload);
    expect(successBody.success).toBe(true);
    expect(successBody.data?.receiver_count).toBe(5);
    expect(successBody.data?.coin_amount).toBe(500);
    expect(successBody.data?.sender_balance_after).toBe(0);

    // Verify sender lost exactly 500
    const finalSenderBal = (
      await prisma.user.findUniqueOrThrow({ where: { id: BigInt(sender.id) } })
    ).walletBalance;
    expect(finalSenderBal).toBe(0n);

    // Verify all 5 recipients received gems
    for (let i = 0; i < recipients.length; i++) {
      const g = (
        await prisma.user.findUniqueOrThrow({
          where: { id: BigInt(recipients[i].id) },
        })
      ).gems;
      expect(g).toBeGreaterThan(initialGems[i]);
    }

    // Verify ledger entries reconcile: exactly 5 rows of -100 coins each
    const successLedgerRows = await prisma.coinTransaction.findMany({
      where: {
        userId: BigInt(sender.id),
        type: 'GIFT',
        meta: { path: ['gift_id'], equals: Number(gift.id) },
      },
    });
    expect(successLedgerRows).toHaveLength(5);
    const totalLedgerDebit = successLedgerRows.reduce(
      (sum, row) => sum + Number(row.coinAmount),
      0,
    );
    expect(totalLedgerDebit).toBe(-500);

    // Step C: Duplicate recipient IDs are safely deduplicated per existing business logic
    await creditCoins(sender.id, 200);
    const dupRes = await app.inject({
      method: 'POST',
      url: '/api/v1/gifts/send-batch',
      headers: authHeader(sender.token),
      payload: {
        gift_id: Number(gift.id),
        receiver_ids: [recipients[0].id, recipients[0].id],
        quantity: 1,
        room_id: roomId,
      },
    });
    expect(dupRes.statusCode).toBe(201);
    const dupBody = parse<{
      coin_amount: number;
      receiver_count: number;
      sender_balance_after: number;
    }>(dupRes.payload);
    expect(dupBody.success).toBe(true);
    expect(dupBody.data?.receiver_count).toBe(1);
    expect(dupBody.data?.coin_amount).toBe(100);
    expect(dupBody.data?.sender_balance_after).toBe(100);
  });
});

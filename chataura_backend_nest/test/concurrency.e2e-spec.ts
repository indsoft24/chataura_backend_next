import { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  authHeader,
  createTestApp,
  creditCoins,
  firstGiftId,
  parse,
  prisma,
  setRole,
  AuthedUser,
} from './e2e.helpers';

let userSeq = 100;
async function createUser(app: NestFastifyApplication): Promise<AuthedUser> {
  userSeq++;
  const clientIp = `10.99.${Math.floor(userSeq / 250)}.${(userSeq % 250) + 1}`;
  const email = `conc_${Date.now()}_${userSeq}@gmail.com`;
  const password = 'secretPassword123';

  const reg = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    headers: { 'x-forwarded-for': clientIp },
    payload: {
      email,
      password,
      display_name: `User ${userSeq}`,
    },
  });
  const regBody = parse<{ access_token: string; user: { id: number } }>(reg.payload);
  if (!regBody.success || !regBody.data?.access_token) {
    throw new Error(`Registration failed: ${reg.payload}`);
  }
  const token = regBody.data.access_token;
  const userId = regBody.data.user.id;

  const otpRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/send-email-otp',
    headers: { ...authHeader(token), 'x-forwarded-for': clientIp },
    payload: {},
  });
  const otp = parse<{ dev_otp?: string }>(otpRes.payload).data?.dev_otp;
  await app.inject({
    method: 'POST',
    url: '/api/v1/auth/verify-email-otp',
    headers: { ...authHeader(token), 'x-forwarded-for': clientIp },
    payload: { otp },
  });

  return {
    id: Number(userId),
    email,
    password,
    token,
    refresh: '',
    inviteCode: '',
  };
}

describe('Production Concurrency & Thread-Safety (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('1. Same Wallet Concurrency', () => {
    it('prevents negative balances under concurrent debit requests', async () => {
      const sender = await createUser(app);
      const receiver = await createUser(app);
      await setRole(sender.id, 'seller');

      // Set sender balance to exactly 250 coins
      await prisma.user.update({
        where: { id: BigInt(sender.id) },
        data: { walletBalance: 250n, coinBalance: 250n },
      });

      // Fire 6 concurrent transfers of 100 coins each (total 600 attempted on a 250 balance)
      const promises = Array.from({ length: 6 }).map(() =>
        app.inject({
          method: 'POST',
          url: '/api/v1/wallet/transfer',
          headers: authHeader(sender.token),
          payload: {
            receiver_id: receiver.id,
            coin_amount: 100,
            note: 'Concurrent test transfer',
          },
        }),
      );

      const responses = await Promise.all(promises);

      const successes = responses.filter((r) => r.statusCode === 200 || r.statusCode === 201);
      const failures = responses.filter((r) => r.statusCode === 400);

      // Exactly 2 transfers of 100 can succeed from 250 coins; remaining 4 must fail with INSUFFICIENT_BALANCE
      expect(successes.length).toBe(2);
      expect(failures.length).toBe(4);

      for (const fail of failures) {
        const body = parse(fail.payload);
        expect(body.error?.code).toBe('INSUFFICIENT_BALANCE');
      }

      // Check DB: balance must be exactly 50 coins and never negative
      const u = await prisma.user.findUniqueOrThrow({
        where: { id: BigInt(sender.id) },
      });
      expect(Number(u.walletBalance)).toBe(50);
      expect(Number(u.coinBalance)).toBe(50);
    });
  });

  describe('2. Same Gift Sender & Recipient Concurrency', () => {
    it('handles concurrent gifting without double-debit or dropped receiver credits', async () => {
      const sender = await createUser(app);
      const receiver = await createUser(app);
      const giftId = await firstGiftId();

      const gift = await prisma.gift.findUniqueOrThrow({
        where: { id: BigInt(giftId) },
      });
      const cost = gift.coinCost;

      // Create a room owned by sender
      const roomRes = await app.inject({
        method: 'POST',
        url: '/api/v1/rooms',
        headers: authHeader(sender.token),
        payload: { title: 'Concurrency Gift Room' },
      });
      const room = parse<{ id: string }>(roomRes.payload).data!;

      // Both sender and receiver join the room to be active members
      await app.inject({
        method: 'POST',
        url: `/api/v1/rooms/${room.id}/join`,
        headers: authHeader(sender.token),
      });
      await app.inject({
        method: 'POST',
        url: `/api/v1/rooms/${room.id}/join`,
        headers: authHeader(receiver.token),
      });

      // Give sender balance for exactly 3 gifts
      await prisma.user.update({
        where: { id: BigInt(sender.id) },
        data: { walletBalance: BigInt(cost * 3), coinBalance: BigInt(cost * 3) },
      });

      // Fire 5 concurrent room gift requests
      const promises = Array.from({ length: 5 }).map(() =>
        app.inject({
          method: 'POST',
          url: `/api/v1/rooms/${room.id}/gifts/send`,
          headers: authHeader(sender.token),
          payload: {
            gift_id: giftId,
            receiver_id: receiver.id,
            quantity: 1,
          },
        }),
      );

      const responses = await Promise.all(promises);
      const successes = responses.filter((r) => r.statusCode === 200 || r.statusCode === 201);
      const failures = responses.filter((r) => r.statusCode === 400);

      expect(successes.length).toBe(3);
      expect(failures.length).toBe(2);

      const senderDb = await prisma.user.findUniqueOrThrow({
        where: { id: BigInt(sender.id) },
      });
      expect(Number(senderDb.walletBalance)).toBe(0);

      const receiverDb = await prisma.user.findUniqueOrThrow({
        where: { id: BigInt(receiver.id) },
      });
      const settings = await prisma.adminSetting.findUnique({ where: { id: 1 } });
      const commissionPct = Number(settings?.giftCommissionPct ?? 20) / 100;
      const expectedPerNetGems = cost - Math.floor(cost * commissionPct);
      expect(Number(receiverDb.gems)).toBe(expectedPerNetGems * 3);
    });
  });

  describe('3. Same Room Seat Concurrency', () => {
    it('allows exactly ONE user to occupy a seat under concurrent takeSeat requests', async () => {
      const host = await createUser(app);
      const candidates = await Promise.all([
        createUser(app),
        createUser(app),
        createUser(app),
        createUser(app),
      ]);

      const roomRes = await app.inject({
        method: 'POST',
        url: '/api/v1/rooms',
        headers: authHeader(host.token),
        payload: { title: 'Seat Race Room', max_seats: 8 },
      });
      const room = parse<{ id: string }>(roomRes.payload).data!;

      // All candidates join room
      for (const c of candidates) {
        await app.inject({
          method: 'POST',
          url: `/api/v1/rooms/${room.id}/join`,
          headers: authHeader(c.token),
        });
        // Host assigns them speaker role so they are eligible to take seats
        await prisma.roomMember.update({
          where: { roomId_userId: { roomId: room.id, userId: BigInt(c.id) } },
          data: { role: 'speaker' },
        });
      }

      // All 4 candidates race to take seat index 2 concurrently
      const targetSeatIndex = 2;
      const promises = candidates.map((c) =>
        app.inject({
          method: 'POST',
          url: `/api/v1/rooms/${room.id}/seats/${targetSeatIndex}/take`,
          headers: authHeader(c.token),
        }),
      );

      const responses = await Promise.all(promises);

      const successes = responses.filter((r) => r.statusCode === 200 || r.statusCode === 201);
      const failures = responses.filter((r) => r.statusCode === 400);

      // Exactly ONE candidate must succeed in occupying the seat!
      expect(successes.length).toBe(1);
      expect(failures.length).toBe(3);

      for (const fail of failures) {
        const body = parse(fail.payload);
        expect(body.error?.code).toBe('SEAT_TAKEN');
      }

      // Verify the seat in the database has exactly 1 occupant
      const seat = await prisma.seat.findUnique({
        where: { roomId_seatIndex: { roomId: room.id, seatIndex: targetSeatIndex } },
      });
      expect(seat?.userId).not.toBeNull();
      const winningUserId = successes[0] ? parse<any>(successes[0].payload).data?.viewer?.user_id : null;
      expect(Number(seat?.userId)).toBe(winningUserId);
    });
  });

  describe('4. Same Razorpay Payment Concurrency', () => {
    it('credits coins exactly ONCE under concurrent verification requests', async () => {
      const user = await createUser(app);
      const initialBalance = (await prisma.user.findUniqueOrThrow({ where: { id: BigInt(user.id) } })).walletBalance;
      const packageId = await prisma.coinPackage.findFirst({ where: { isActive: true } });

      const init = await app.inject({
        method: 'POST',
        url: '/api/v1/wallet/recharge/initiate',
        headers: authHeader(user.token),
        payload: { package_id: Number(packageId!.id), country: 'IN', currency: 'INR' },
      });
      const orderId = parse<{ razorpay_order_id: string }>(init.payload).data!.razorpay_order_id;
      const paymentId = `pay_race_${Date.now()}`;

      // Fire 5 concurrent verify requests with the identical order and payment IDs
      const promises = Array.from({ length: 5 }).map(() =>
        app.inject({
          method: 'POST',
          url: '/api/v1/wallet/recharge/verify',
          headers: authHeader(user.token),
          payload: {
            razorpay_order_id: orderId,
            razorpay_payment_id: paymentId,
            razorpay_signature: 'mock',
          },
        }),
      );

      const responses = await Promise.all(promises);

      // All 5 requests should complete cleanly (either success or already_credited)
      for (const res of responses) {
        expect([200, 201]).toContain(res.statusCode);
      }

      // User must be credited EXACTLY ONCE with package.coins, NOT 5x!
      const u = await prisma.user.findUniqueOrThrow({
        where: { id: BigInt(user.id) },
      });
      expect(Number(u.walletBalance)).toBe(Number(initialBalance) + packageId!.coins);

      // Ledger must contain exactly 1 RECHARGE transaction for this payment ID
      const txCount = await prisma.coinTransaction.count({
        where: { userId: BigInt(user.id), type: 'RECHARGE', referenceId: paymentId },
      });
      expect(txCount).toBe(1);
    });
  });

  describe('5. Same Star Chat Session Creation & Billing Concurrency', () => {
    it('creates only ONE active session and bills only ONCE under concurrent endSession', async () => {
      const payer = await createUser(app);
      const star = await createUser(app);

      // Set star user as star account and seller
      await prisma.user.update({
        where: { id: BigInt(star.id) },
        data: { isStarAccount: true, role: 'seller' },
      });
      await creditCoins(payer.id, 1000);

      // Create conversation between payer and star
      const convoRes = await app.inject({
        method: 'GET',
        url: `/api/v1/conversations/with-user/${star.id}`,
        headers: authHeader(payer.token),
      });
      const convoId = parse<{ conversation_id: number }>(convoRes.payload).data!.conversation_id;

      // 1. Race 5 concurrent startSession calls
      const startPromises = Array.from({ length: 5 }).map(() =>
        app.inject({
          method: 'POST',
          url: '/api/v1/star-chat/sessions',
          headers: authHeader(payer.token),
          payload: { conversation_id: convoId },
        }),
      );
      const startResponses = await Promise.all(startPromises);
      for (const res of startResponses) {
        expect([200, 201]).toContain(res.statusCode);
      }

      // Ensure DB only has 1 active session for this conversation
      const activeSessions = await prisma.starChatSession.findMany({
        where: { conversationId: BigInt(convoId), status: 'active' },
      });
      expect(activeSessions.length).toBe(1);
      const sessionId = activeSessions[0].id;

      const payerBalanceBefore = (await prisma.user.findUniqueOrThrow({ where: { id: BigInt(payer.id) } })).walletBalance;

      // 2. Race 5 concurrent endSession calls
      const endPromises = Array.from({ length: 5 }).map(() =>
        app.inject({
          method: 'POST',
          url: `/api/v1/star-chat/sessions/${sessionId}/end`,
          headers: authHeader(payer.token),
          payload: {},
        }),
      );
      const endResponses = await Promise.all(endPromises);
      for (const res of endResponses) {
        expect([200, 201]).toContain(res.statusCode);
      }

      // Session must be ended and ledger must have exactly 1 STAR_CHAT debit
      const endedSession = await prisma.starChatSession.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(endedSession.status).toBe('ended');

      const debitLedger = await prisma.coinTransaction.findMany({
        where: { userId: BigInt(payer.id), type: 'STAR_CHAT', referenceId: `star_chat_${sessionId}` },
      });
      expect(debitLedger.length).toBe(1);

      const payerBalanceAfter = (await prisma.user.findUniqueOrThrow({ where: { id: BigInt(payer.id) } })).walletBalance;
      expect(payerBalanceBefore - payerBalanceAfter).toBe(BigInt(endedSession.coinsCharged));
    });
  });

  describe('6. Same Game Round Settlement Concurrency', () => {
    it('settles a game round exactly once under concurrent settlement triggers', async () => {
      const user = await createUser(app);
      await creditCoins(user.id, 500);

      // Create a round that has ended
      const round = await prisma.greedyRound.create({
        data: {
          phase: 'betting',
          bettingEndsAt: new Date(Date.now() - 5000), // Ended 5s ago
        },
      });

      // Place a bet
      await prisma.greedyBet.create({
        data: {
          roundId: round.id,
          userId: BigInt(user.id),
          item: 'chicken',
          chipAmount: 100n,
          multiplier: 5,
          potentialPayout: 500n,
          status: 'placed',
        },
      });

      // Trigger greedyState concurrently 5 times (each triggers settleGreedyIfDue)
      const promises = Array.from({ length: 5 }).map(() =>
        app.inject({
          method: 'GET',
          url: '/api/v1/game/greedy/state',
          headers: authHeader(user.token),
        }),
      );

      const responses = await Promise.all(promises);
      for (const r of responses) {
        expect(r.statusCode).toBe(200);
      }

      // The round must be completed and settled exactly once
      const completedRound = await prisma.greedyRound.findUniqueOrThrow({
        where: { id: round.id },
      });
      expect(completedRound.phase).toBe('completed');
      expect(completedRound.winningItem).not.toBeNull();
      expect(completedRound.settledAt).not.toBeNull();

      // If user won, check that payout was credited at most once
      const winCredits = await prisma.coinTransaction.findMany({
        where: { userId: BigInt(user.id), type: 'GAME_GREEDY_WIN', referenceId: `greedy_win_${round.id}` },
      });
      if (completedRound.winningItem === 'chicken') {
        expect(winCredits.length).toBe(1);
      } else {
        expect(winCredits.length).toBe(0);
      }
    });
  });

  describe('7. Frame Purchase Idempotency', () => {
    it('debits coins exactly ONCE when user clicks purchaseFrame concurrently', async () => {
      const user = await createUser(app);
      await creditCoins(user.id, 500);

      const frame = await prisma.frame.create({
        data: {
          name: `Concurrency Frame ${Date.now()}`,
          coinCost: 100,
          isActive: true,
        },
      });

      // Fire 4 concurrent purchase calls for this frame
      const promises = Array.from({ length: 4 }).map(() =>
        app.inject({
          method: 'POST',
          url: `/api/v1/profile/frames/${frame!.id}/purchase`,
          headers: authHeader(user.token),
          payload: { frame_id: Number(frame!.id) },
        }),
      );

      const responses = await Promise.all(promises);
      for (const r of responses) {
        if (r.statusCode !== 200 && r.statusCode !== 201) {
          console.error('Test 7 failed response:', r.statusCode, r.payload);
        }
        expect([200, 201]).toContain(r.statusCode);
      }

      // Exactly 1 frame transaction must exist in the ledger, and balance debited by cost exactly ONCE
      const ledger = await prisma.coinTransaction.findMany({
        where: { userId: BigInt(user.id), type: 'FRAME', referenceId: `frame_${frame.id}` },
      });
      expect(ledger.length).toBe(1);

      const u = await prisma.user.findUniqueOrThrow({ where: { id: BigInt(user.id) } });
      expect(Number(u.walletBalance)).toBe(500 + 50 - frame.coinCost);
    });
  });
});

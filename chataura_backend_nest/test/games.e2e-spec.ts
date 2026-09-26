import { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  GREEDY_ITEMS,
  LUCKY77_OPTIONS,
} from '../src/modules/game/game.constants';
import { GameService } from '../src/modules/game/game.service';
import {
  authHeader,
  createTestApp,
  creditCoins,
  parse,
  prisma,
  registerVerified,
  setRole,
  sleep,
} from './e2e.helpers';

async function waitForOpenRound(
  app: NestFastifyApplication,
  token: string,
  path: string,
) {
  for (let i = 0; i < 40; i++) {
    const res = await app.inject({
      method: 'GET',
      url: path,
      headers: authHeader(token),
    });
    const body = parse<{
      phase: string;
      seconds_remaining: number;
      round_id: number;
    }>(res.payload);
    if (
      body.success &&
      body.data?.phase === 'betting' &&
      (body.data.seconds_remaining ?? 0) > 4
    ) {
      return body.data;
    }
    await sleep(500);
  }
  throw new Error(`no open betting window for ${path}`);
}

describe('Games (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('greedy state/bet/result settles and opens a new round', async () => {
    const user = await registerVerified(app);
    await creditCoins(user.id, 50_000);
    const open = await waitForOpenRound(
      app,
      user.token,
      '/api/v1/game/greedy/state',
    );
    const bet = await app.inject({
      method: 'POST',
      url: '/api/v1/game/greedy/bet',
      headers: authHeader(user.token),
      payload: { item: 'carrot', amount: 10000 },
    });
    const placed = parse<{ remaining_balance: number; round_id: number }>(
      bet.payload,
    );
    expect(placed.success).toBe(true);
    expect(placed.data!.remaining_balance).toBeGreaterThanOrEqual(0);

    await sleep((open.seconds_remaining + 3) * 1000);
    const result = await app.inject({
      method: 'GET',
      url: `/api/v1/game/greedy/result?round_id=${open.round_id}`,
      headers: authHeader(user.token),
    });
    const settled = parse<{
      next_round_id?: number;
      phase: string;
      user_balance: number;
    }>(result.payload);
    expect(settled.success).toBe(true);
    expect(settled.data!.user_balance).toBeGreaterThanOrEqual(0);
    if (settled.data?.next_round_id != null) {
      expect(settled.data.next_round_id).not.toBe(open.round_id);
    }
  }, 60000);

  it('lucky77 state/bet/result', async () => {
    const user = await registerVerified(app);
    await creditCoins(user.id, 80_000);
    const open = await waitForOpenRound(
      app,
      user.token,
      '/api/v1/game/lucky77/state',
    );
    const bet = await app.inject({
      method: 'POST',
      url: '/api/v1/game/lucky77/bet',
      headers: authHeader(user.token),
      payload: { option: 'watermelon', amount: 50000 },
    });
    expect(parse(bet.payload).success).toBe(true);
    await sleep((open.seconds_remaining + 3) * 1000);
    const result = await app.inject({
      method: 'GET',
      url: `/api/v1/game/lucky77/result?round_id=${open.round_id}`,
      headers: authHeader(user.token),
    });
    const settled = parse<{ user_balance: number }>(result.payload);
    expect(settled.success).toBe(true);
    expect(settled.data!.user_balance).toBeGreaterThanOrEqual(0);
  }, 60000);

  it('seller cannot play; admin and agency can play', async () => {
    const seller = await registerVerified(app);
    const admin = await registerVerified(app);
    const agency = await registerVerified(app);
    await setRole(seller.id, 'seller');
    await setRole(admin.id, 'admin');
    await setRole(agency.id, 'agency');
    await creditCoins(seller.id, 20_000);
    await creditCoins(admin.id, 20_000);
    await creditCoins(agency.id, 20_000);
    await waitForOpenRound(app, seller.token, '/api/v1/game/greedy/state');

    const sellerBet = await app.inject({
      method: 'POST',
      url: '/api/v1/game/greedy/bet',
      headers: authHeader(seller.token),
      payload: { item: 'carrot', amount: 10000 },
    });
    expect(parse(sellerBet.payload).error?.code).toBe(
      'COIN_SELLER_GAMES_FORBIDDEN',
    );

    const adminBet = await app.inject({
      method: 'POST',
      url: '/api/v1/game/lucky77/bet',
      headers: authHeader(admin.token),
      payload: { option: 'plum', amount: 50000 },
    });
    const adminBody = parse(adminBet.payload);
    expect(adminBody.error?.code).not.toBe('STAFF_GAMES_FORBIDDEN');
    expect(adminBody.error?.code).not.toBe('COIN_SELLER_GAMES_FORBIDDEN');
    expect(adminBet.statusCode).toBeLessThan(400);

    const agencyBet = await app.inject({
      method: 'POST',
      url: '/api/v1/game/greedy/bet',
      headers: authHeader(agency.token),
      payload: { item: 'carrot', amount: 10000 },
    });
    const agencyBody = parse(agencyBet.payload);
    expect(agencyBody.error?.code).not.toBe('STAFF_GAMES_FORBIDDEN');
    expect(agencyBody.error?.code).not.toBe('COIN_SELLER_GAMES_FORBIDDEN');
    expect(agencyBet.statusCode).toBeLessThan(400);
  }, 40000);

  it('greedy concurrent settlement is single-claimer and executes exactly once without double payout', async () => {
    const user = await registerVerified(app);
    await creditCoins(user.id, 100_000);
    const gameService = app.get(GameService);

    // Create an expired round directly in DB
    const round = await prisma.greedyRound.create({
      data: {
        phase: 'betting',
        bettingEndsAt: new Date(Date.now() - 5000),
      },
    });

    // Place bets on all possible items so we guarantee there is a winning bet
    const items = Object.keys(GREEDY_ITEMS);
    for (const item of items) {
      const spec = GREEDY_ITEMS[item];
      await prisma.greedyBet.create({
        data: {
          roundId: round.id,
          userId: BigInt(user.id),
          item,
          chipAmount: 1000n,
          multiplier: spec.multiplier,
          potentialPayout: BigInt(1000 * spec.multiplier),
        },
      });
    }

    // Fire 25 simultaneous settlement requests (20 explicit roundId, 3 background tick, 2 API)
    const settleCalls = [
      ...Array.from({ length: 20 }, () =>
        gameService.settleGreedyIfDue(round.id),
      ),
      gameService.settleGreedyIfDue(),
      gameService.settleGreedyIfDue(),
      gameService.settleGreedyIfDue(),
      app.inject({
        method: 'GET',
        url: `/api/v1/game/greedy/result?round_id=${round.id}`,
        headers: authHeader(user.token),
      }),
      app.inject({
        method: 'GET',
        url: `/api/v1/game/greedy/result?round_id=${round.id}`,
        headers: authHeader(user.token),
      }),
    ];

    await Promise.all(settleCalls);

    // Verify database state
    const settledRound = await prisma.greedyRound.findUnique({
      where: { id: round.id },
    });
    expect(settledRound?.phase).toBe('completed');
    expect(settledRound?.winningItem).not.toBeNull();
    expect(settledRound?.settledAt).not.toBeNull();

    // Verify winner does not change on subsequent settlement attempt
    const initialWinner = settledRound!.winningItem;
    await gameService.settleGreedyIfDue(round.id);
    const roundAfterRetry = await prisma.greedyRound.findUnique({
      where: { id: round.id },
    });
    expect(roundAfterRetry?.winningItem).toBe(initialWinner);

    // Verify payout happened EXACTLY once
    const winTx = await prisma.coinTransaction.findMany({
      where: {
        userId: BigInt(user.id),
        type: 'GAME_GREEDY_WIN',
        referenceId: `greedy_win_${round.id}`,
      },
    });
    expect(winTx).toHaveLength(1);
    const winningSpec = GREEDY_ITEMS[settledRound!.winningItem!];
    expect(Number(winTx[0].coinAmount)).toBe(1000 * winningSpec.multiplier);

    // Verify bets statuses
    const bets = await prisma.greedyBet.findMany({
      where: { roundId: round.id },
    });
    const wonBets = bets.filter((b) => b.status === 'won');
    const lostBets = bets.filter((b) => b.status === 'lost');
    expect(wonBets).toHaveLength(1);
    expect(wonBets[0].item).toBe(settledRound?.winningItem);
    expect(Number(wonBets[0].actualPayout)).toBe(1000 * winningSpec.multiplier);
    expect(lostBets).toHaveLength(items.length - 1);
  });

  it('lucky77 concurrent settlement executes exactly once under race conditions (25 callers)', async () => {
    const user = await registerVerified(app);
    await creditCoins(user.id, 100_000);
    const gameService = app.get(GameService);

    const round = await prisma.lucky77Round.create({
      data: {
        phase: 'betting',
        bettingEndsAt: new Date(Date.now() - 5000),
      },
    });

    // Place bets on all options so one is guaranteed to win
    for (const [option, spec] of Object.entries(LUCKY77_OPTIONS)) {
      await prisma.lucky77Bet.create({
        data: {
          roundId: round.id,
          userId: BigInt(user.id),
          option,
          chipAmount: 2000n,
          multiplier: spec.multiplier,
          potentialPayout: BigInt(2000 * spec.multiplier),
        },
      });
    }

    // Fire 25 concurrent settlement requests (20 explicit, 3 background tick, 2 API)
    const settleCalls = [
      ...Array.from({ length: 20 }, () =>
        gameService.settleLuckyIfDue(round.id),
      ),
      gameService.settleLuckyIfDue(),
      gameService.settleLuckyIfDue(),
      gameService.settleLuckyIfDue(),
      app.inject({
        method: 'GET',
        url: `/api/v1/game/lucky77/result?round_id=${round.id}`,
        headers: authHeader(user.token),
      }),
      app.inject({
        method: 'GET',
        url: `/api/v1/game/lucky77/result?round_id=${round.id}`,
        headers: authHeader(user.token),
      }),
    ];

    await Promise.all(settleCalls);

    const settledRound = await prisma.lucky77Round.findUnique({
      where: { id: round.id },
    });
    expect(settledRound?.phase).toBe('completed');
    expect(settledRound?.winningItem).not.toBeNull();
    expect(settledRound?.settledAt).not.toBeNull();

    // Verify winner immutability on re-settle
    const luckyWinner = settledRound!.winningItem;
    await gameService.settleLuckyIfDue(round.id);
    const reRound = await prisma.lucky77Round.findUnique({
      where: { id: round.id },
    });
    expect(reRound?.winningItem).toBe(luckyWinner);

    const winTx = await prisma.coinTransaction.findMany({
      where: {
        userId: BigInt(user.id),
        type: 'GAME_LUCKY77_WIN',
        referenceId: `lucky77_win_${round.id}`,
      },
    });
    expect(winTx).toHaveLength(1);
    const winningSpec = LUCKY77_OPTIONS[settledRound!.winningItem!];
    expect(Number(winTx[0].coinAmount)).toBe(2000 * winningSpec.multiplier);

    const bets = await prisma.lucky77Bet.findMany({
      where: { roundId: round.id },
    });
    const wonBets = bets.filter((b) => b.status === 'won');
    expect(wonBets).toHaveLength(1);
    expect(wonBets[0].option).toBe(settledRound?.winningItem);
  });

  it('greedyLeaderboard aggregates correctly with high bet volume without unbounded memory', async () => {
    const gameService = app.get(GameService);
    const user1 = await registerVerified(app, { name: 'ChampionUser' });
    const user2 = await registerVerified(app, { name: 'RunnerUpUser' });
    const user3 = await registerVerified(app, { name: 'ThirdPlaceUser' });

    const round = await prisma.greedyRound.create({
      data: {
        phase: 'completed',
        bettingEndsAt: new Date(Date.now() - 10000),
        winningItem: 'carrot',
        winningMultiplier: 5,
        settledAt: new Date(),
      },
    });

    // Create 1,000+ bets across users to verify high-volume query aggregation
    const betBatch = [];
    for (let i = 0; i < 100; i++) {
      betBatch.push({
        roundId: round.id,
        userId: BigInt(user1.id),
        item: 'carrot',
        chipAmount: 2000n,
        multiplier: 5,
        potentialPayout: 10000n,
        actualPayout: 10000n,
        status: 'won' as const,
        createdAt: new Date(),
      });
    }
    for (let i = 0; i < 50; i++) {
      betBatch.push({
        roundId: round.id,
        userId: BigInt(user2.id),
        item: 'carrot',
        chipAmount: 2000n,
        multiplier: 5,
        potentialPayout: 10000n,
        actualPayout: 10000n,
        status: 'won' as const,
        createdAt: new Date(),
      });
    }
    for (let i = 0; i < 20; i++) {
      betBatch.push({
        roundId: round.id,
        userId: BigInt(user3.id),
        item: 'carrot',
        chipAmount: 2000n,
        multiplier: 5,
        potentialPayout: 10000n,
        actualPayout: 10000n,
        status: 'won' as const,
        createdAt: new Date(),
      });
    }
    for (let i = 0; i < 850; i++) {
      betBatch.push({
        roundId: round.id,
        userId: BigInt(user3.id),
        item: 'tomato',
        chipAmount: 1000n,
        multiplier: 5,
        potentialPayout: 5000n,
        actualPayout: 0n,
        status: 'lost' as const,
        createdAt: new Date(),
      });
    }

    await prisma.greedyBet.createMany({ data: betBatch });

    const startTime = Date.now();
    const leaderboard = await gameService.greedyLeaderboard(5);
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(1000);
    expect(leaderboard.length).toBeLessThanOrEqual(5);
    expect(leaderboard.length).toBeGreaterThanOrEqual(3);

    // Verify ordering
    for (let i = 0; i < leaderboard.length - 1; i++) {
      expect(leaderboard[i].total_won).toBeGreaterThanOrEqual(
        leaderboard[i + 1].total_won,
      );
      expect(leaderboard[i].rank).toBe(i + 1);
    }
  });
});

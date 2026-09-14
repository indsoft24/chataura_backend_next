import { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  authHeader,
  createTestApp,
  creditCoins,
  parse,
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

  it('seller and admin cannot play', async () => {
    const seller = await registerVerified(app);
    const admin = await registerVerified(app);
    await setRole(seller.id, 'seller');
    await setRole(admin.id, 'admin');
    await creditCoins(seller.id, 20_000);
    await creditCoins(admin.id, 20_000);
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
    expect(parse(adminBet.payload).error?.code).toBe('STAFF_GAMES_FORBIDDEN');
  }, 40000);
});

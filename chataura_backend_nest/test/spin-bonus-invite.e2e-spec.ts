import { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  authHeader,
  createTestApp,
  creditCoins,
  parse,
  registerVerified,
} from './e2e.helpers';

describe('Spin / bonuses / invite / calls stub (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('spin prizes + play', async () => {
    const user = await registerVerified(app);
    await creditCoins(user.id, 200);
    const prizes = await app.inject({
      method: 'GET',
      url: '/api/v1/spin/prizes',
      headers: authHeader(user.token),
    });
    const list = parse<{
      spin_cost: number;
      prizes: Array<{ type: string; probability: number }>;
    }>(prizes.payload);
    expect(list.success).toBe(true);
    expect(list.data?.spin_cost).toBe(50);
    expect(list.data?.prizes.length).toBeGreaterThan(0);

    const play = await app.inject({
      method: 'POST',
      url: '/api/v1/spin/play',
      headers: authHeader(user.token),
      payload: {},
    });
    const result = parse<{
      prize_type: string;
      prize_value: number;
      new_balance: number;
    }>(play.payload);
    expect(result.success).toBe(true);
    expect(['coins', 'gift', 'loss']).toContain(result.data?.prize_type);
    expect(result.data!.new_balance).toBeGreaterThanOrEqual(0);
  });

  it('bonuses config/status and claims', async () => {
    const user = await registerVerified(app);
    const cfg = await app.inject({
      method: 'GET',
      url: '/api/v1/bonuses/config',
      headers: authHeader(user.token),
    });
    const config = parse<{ admob: { coins: number } }>(cfg.payload);
    expect(config.success).toBe(true);
    expect(config.data?.admob).toBeTruthy();

    const status = await app.inject({
      method: 'GET',
      url: '/api/v1/bonuses/status',
      headers: authHeader(user.token),
    });
    expect(parse(status.payload).success).toBe(true);

    const admob = await app.inject({
      method: 'POST',
      url: '/api/v1/bonuses/claim-admob',
      headers: authHeader(user.token),
      payload: {},
    });
    const admobBody = parse<{
      bonus: { coins: number; bonus_type: string };
      wallet_balance: number;
    }>(admob.payload);
    expect(admobBody.success).toBe(true);
    expect(admobBody.data?.bonus.bonus_type).toBe('admob');
    expect(admobBody.data!.wallet_balance).toBeGreaterThanOrEqual(0);

    const game = await app.inject({
      method: 'POST',
      url: '/api/v1/bonuses/claim-game',
      headers: authHeader(user.token),
      payload: { game_type: 'game_1', won: true },
    });
    const gameBody = parse<{
      bonus: { bonus_type: string };
      wallet_balance: number;
    }>(game.payload);
    expect(gameBody.success).toBe(true);
    expect(gameBody.data!.wallet_balance).toBeGreaterThanOrEqual(0);

    const streak = await app.inject({
      method: 'POST',
      url: '/api/v1/bonuses/claim-streak',
      headers: authHeader(user.token),
      payload: {},
    });
    const streakBody = parse<{
      bonus: { bonus_type: string; streak_count: number };
      wallet_balance: number;
    }>(streak.payload);
    expect(streakBody.success).toBe(true);
    expect(streakBody.data?.bonus.bonus_type).toBe('streak');
    expect(streakBody.data!.wallet_balance).toBeGreaterThanOrEqual(0);
  });

  it('invite info + apply (not self)', async () => {
    const inviter = await registerVerified(app);
    const invitee = await registerVerified(app);

    const mine = await app.inject({
      method: 'GET',
      url: '/api/v1/users/me/invite',
      headers: authHeader(inviter.token),
    });
    const info = parse<{
      invite_code: string;
      invite_link: string;
      total_invited: number;
    }>(mine.payload);
    expect(info.success).toBe(true);
    expect(info.data?.invite_code).toBeTruthy();
    expect(info.data?.invite_link).toContain(info.data!.invite_code);

    const self = await app.inject({
      method: 'POST',
      url: '/api/v1/invite/apply',
      headers: authHeader(inviter.token),
      payload: { invite_code: info.data!.invite_code },
    });
    expect(parse(self.payload).success).toBe(false);

    const apply = await app.inject({
      method: 'POST',
      url: '/api/v1/invite/apply',
      headers: authHeader(invitee.token),
      payload: { invite_code: info.data!.invite_code },
    });
    expect(parse(apply.payload).success).toBe(true);
  });

  it('availability is busy only in a live room', async () => {
    const user = await registerVerified(app);
    const idle = await app.inject({
      method: 'GET',
      url: '/api/v1/users/me/availability',
      headers: authHeader(user.token),
    });
    const before = parse<{
      is_busy: boolean;
      is_in_room: boolean;
      can_start_call: boolean;
    }>(idle.payload);
    expect(before.success).toBe(true);
    expect(before.data?.is_busy).toBe(false);
    expect(before.data?.can_start_call).toBe(false);

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/rooms',
      headers: authHeader(user.token),
      payload: { title: `Avail ${Date.now()}` },
    });
    const roomId = parse<{ id: string }>(created.payload).data!.id;
    await app.inject({
      method: 'POST',
      url: `/api/v1/rooms/${roomId}/join`,
      headers: authHeader(user.token),
      payload: {},
    });
    const busy = await app.inject({
      method: 'GET',
      url: '/api/v1/users/me/availability',
      headers: authHeader(user.token),
    });
    const after = parse<{
      is_busy: boolean;
      is_in_room: boolean;
      active_room_id: string;
    }>(busy.payload);
    expect(after.data?.is_busy).toBe(true);
    expect(after.data?.is_in_room).toBe(true);
    expect(after.data?.active_room_id).toBe(roomId);
  });

  it('/call/* stays FEATURE_DISABLED', async () => {
    const user = await registerVerified(app);
    for (const url of [
      '/api/v1/call/token',
      '/api/v1/call/initiate',
      '/api/v1/agora/token',
      '/api/v1/calls/history',
    ]) {
      const res = await app.inject({
        method: url.includes('initiate') || url.includes('agora') ? 'POST' : 'GET',
        url,
        headers: authHeader(user.token),
        payload: {},
      });
      const body = parse(res.payload);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('FEATURE_DISABLED');
    }
  });
});

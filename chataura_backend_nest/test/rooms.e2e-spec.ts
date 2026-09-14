import { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  authHeader,
  createTestApp,
  creditCoins,
  firstGiftId,
  parse,
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
    await creditCoins(host.id, 200);

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
});

import { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  authHeader,
  createTestApp,
  creditCoins,
  parse,
  prisma,
  registerVerified,
} from './e2e.helpers';

describe('Chat / star-chat (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('with-user, send blocked without session, start/heartbeat/end deducts coins', async () => {
    const payer = await registerVerified(app, { name: 'Payer' });
    const star = await registerVerified(app, { name: 'Star' });
    await prisma.user.update({
      where: { id: BigInt(star.id) },
      data: { isStarAccount: true },
    });
    await creditCoins(payer.id, 50);

    const withUser = await app.inject({
      method: 'GET',
      url: `/api/v1/conversations/with-user/${star.id}`,
      headers: authHeader(payer.token),
    });
    const convo = parse<{ conversation_id: number }>(withUser.payload);
    expect(convo.success).toBe(true);
    const conversationId = convo.data!.conversation_id;

    const blocked = await app.inject({
      method: 'POST',
      url: '/api/v1/messages/send',
      headers: authHeader(payer.token),
      payload: {
        conversation_id: conversationId,
        message: 'hello',
        message_type: 'text',
      },
    });
    expect(blocked.statusCode).toBe(403);
    expect(parse(blocked.payload).error?.code).toBe(
      'STAR_CHAT_SESSION_REQUIRED',
    );

    const start = await app.inject({
      method: 'POST',
      url: '/api/v1/star-chat/sessions',
      headers: authHeader(payer.token),
      payload: { conversation_id: conversationId },
    });
    const session = parse<{ id: number }>(start.payload);
    expect(session.success).toBe(true);
    const sessionId = session.data!.id;

    const send = await app.inject({
      method: 'POST',
      url: '/api/v1/messages/send',
      headers: authHeader(payer.token),
      payload: {
        conversation_id: conversationId,
        message: 'hi star',
        message_type: 'text',
      },
    });
    expect(parse(send.payload).success).toBe(true);

    const hb = await app.inject({
      method: 'POST',
      url: `/api/v1/star-chat/sessions/${sessionId}/heartbeat`,
      headers: authHeader(payer.token),
      payload: {},
    });
    expect(parse(hb.payload).success).toBe(true);

    const before = await prisma.user.findUniqueOrThrow({
      where: { id: BigInt(payer.id) },
    });
    const end = await app.inject({
      method: 'POST',
      url: `/api/v1/star-chat/sessions/${sessionId}/end`,
      headers: authHeader(payer.token),
      payload: {},
    });
    expect(parse(end.payload).success).toBe(true);
    const after = await prisma.user.findUniqueOrThrow({
      where: { id: BigInt(payer.id) },
    });
    expect(after.walletBalance < before.walletBalance).toBe(true);
    expect(after.walletBalance >= 0n).toBe(true);
  });
});

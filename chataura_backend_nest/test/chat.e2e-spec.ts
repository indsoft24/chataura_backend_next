import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { ChatService } from '../src/modules/chat/chat.service';
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

  it('listConversations correctly aggregates unread counts without N+1 queries', async () => {
    const userA = await registerVerified(app, { name: 'UserA' });
    const userB = await registerVerified(app, { name: 'UserB' });
    const userC = await registerVerified(app, { name: 'UserC' });

    // User A chats with User B
    const convoABRes = await app.inject({
      method: 'GET',
      url: `/api/v1/conversations/with-user/${userB.id}`,
      headers: authHeader(userA.token),
    });
    const convoAB = parse<{ conversation_id: number }>(convoABRes.payload).data!.conversation_id;

    // User C chats with User B
    const convoCBRes = await app.inject({
      method: 'GET',
      url: `/api/v1/conversations/with-user/${userB.id}`,
      headers: authHeader(userC.token),
    });
    const convoCB = parse<{ conversation_id: number }>(convoCBRes.payload).data!.conversation_id;

    // User A sends 3 messages
    for (let i = 1; i <= 3; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/v1/messages/send',
        headers: authHeader(userA.token),
        payload: {
          conversation_id: convoAB,
          message: `Msg A${i}`,
          message_type: 'text',
        },
      });
    }

    // User C sends 2 messages
    for (let i = 1; i <= 2; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/v1/messages/send',
        headers: authHeader(userC.token),
        payload: {
          conversation_id: convoCB,
          message: `Msg C${i}`,
          message_type: 'text',
        },
      });
    }

    // User B lists conversations
    const listRes1 = await app.inject({
      method: 'GET',
      url: '/api/v1/conversations',
      headers: authHeader(userB.token),
    });
    const list1 = parse<Array<{ id: number; unread_count: number }>>(listRes1.payload);
    expect(list1.success).toBe(true);
    expect(list1.data!.length).toBe(2);

    const convoABEntry = list1.data!.find((c) => c.id === convoAB);
    const convoCBEntry = list1.data!.find((c) => c.id === convoCB);
    expect(convoABEntry?.unread_count).toBe(3);
    expect(convoCBEntry?.unread_count).toBe(2);

    // User B marks convoAB as read
    const readRes = await app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${convoAB}/read`,
      headers: authHeader(userB.token),
      payload: {},
    });
    expect(parse(readRes.payload).success).toBe(true);

    // User B lists conversations again
    const listRes2 = await app.inject({
      method: 'GET',
      url: '/api/v1/conversations',
      headers: authHeader(userB.token),
    });
    const list2 = parse<Array<{ id: number; unread_count: number }>>(listRes2.payload);
    const convoABEntry2 = list2.data!.find((c) => c.id === convoAB);
    const convoCBEntry2 = list2.data!.find((c) => c.id === convoCB);
    expect(convoABEntry2?.unread_count).toBe(0);
    expect(convoCBEntry2?.unread_count).toBe(2);

    // User B sends a message in convoAB (should NOT increment User B's unread count)
    await app.inject({
      method: 'POST',
      url: '/api/v1/messages/send',
      headers: authHeader(userB.token),
      payload: {
        conversation_id: convoAB,
        message: 'Reply from B',
        message_type: 'text',
      },
    });

    const listRes3 = await app.inject({
      method: 'GET',
      url: '/api/v1/conversations',
      headers: authHeader(userB.token),
    });
    const list3 = parse<Array<{ id: number; unread_count: number }>>(listRes3.payload);
    expect(list3.data!.find((c) => c.id === convoAB)?.unread_count).toBe(0);

    // User A lists conversations (should now see 1 unread message from B)
    const listResA = await app.inject({
      method: 'GET',
      url: '/api/v1/conversations',
      headers: authHeader(userA.token),
    });
    const listA = parse<Array<{ id: number; unread_count: number }>>(listResA.payload);
    expect(listA.data!.find((c) => c.id === convoAB)?.unread_count).toBe(1);
  });

  it('listConversations with 50 conversations executes exactly 2 queries (1 findMany + 1 grouped raw count)', async () => {
    const chatService = app.get(ChatService);
    const mainUser = await registerVerified(app, { name: 'Main50' });
    const peerUser = await registerVerified(app, { name: 'Peer50' });

    // Seed 50 conversations for mainUser
    for (let i = 0; i < 50; i++) {
      await prisma.conversation.create({
        data: {
          type: 'private',
          participants: {
            create: [
              { userId: BigInt(mainUser.id) },
              { userId: BigInt(peerUser.id) },
            ],
          },
          messages: {
            create: [
              {
                senderId: BigInt(peerUser.id),
                messageText: `Unread message ${i}`,
                messageType: 'text',
              },
            ],
          },
        },
      });
    }

    const prismaService = app.get(PrismaService);
    const findManySpy = jest.spyOn(prismaService.conversationParticipant, 'findMany');
    const rawSpy = jest.spyOn(prismaService, '$queryRaw');

    const result = await chatService.listConversations(BigInt(mainUser.id), 1, 50);

    expect(result).toHaveLength(50);
    // Bounded queries: exactly 1 conversationParticipant.findMany and 1 $queryRaw
    expect(findManySpy).toHaveBeenCalledTimes(1);
    expect(rawSpy).toHaveBeenCalledTimes(1);

    // Every conversation has unread_count = 1
    for (const c of result) {
      expect(c.unread_count).toBe(1);
    }

    findManySpy.mockRestore();
    rawSpy.mockRestore();
  });

  it('concurrent star-chat endSession requests only charge payer and credit star once', async () => {
    const payer = await registerVerified(app, { name: 'PayerConc' });
    const star = await registerVerified(app, { name: 'StarConc' });
    await prisma.user.update({
      where: { id: BigInt(star.id) },
      data: { isStarAccount: true },
    });
    await creditCoins(payer.id, 500);

    const withUser = await app.inject({
      method: 'GET',
      url: `/api/v1/conversations/with-user/${star.id}`,
      headers: authHeader(payer.token),
    });
    const convo = parse<{ conversation_id: number }>(withUser.payload);
    const conversationId = convo.data!.conversation_id;

    const start = await app.inject({
      method: 'POST',
      url: '/api/v1/star-chat/sessions',
      headers: authHeader(payer.token),
      payload: { conversation_id: conversationId },
    });
    const session = parse<{ id: number }>(start.payload);
    const sessionId = session.data!.id;

    const payerBefore = await prisma.user.findUniqueOrThrow({
      where: { id: BigInt(payer.id) },
    });
    const starBefore = await prisma.user.findUniqueOrThrow({
      where: { id: BigInt(star.id) },
    });

    // Fire 20 concurrent endSession requests
    const attempts = await Promise.all(
      Array.from({ length: 20 }, () =>
        app.inject({
          method: 'POST',
          url: `/api/v1/star-chat/sessions/${sessionId}/end`,
          headers: authHeader(payer.token),
          payload: {},
        }),
      ),
    );

    for (const res of attempts) {
      expect([200, 201]).toContain(res.statusCode);
      expect(parse(res.payload).success).toBe(true);
    }

    const payerAfter = await prisma.user.findUniqueOrThrow({
      where: { id: BigInt(payer.id) },
    });
    const starAfter = await prisma.user.findUniqueOrThrow({
      where: { id: BigInt(star.id) },
    });

    const finishedSession = await prisma.starChatSession.findUniqueOrThrow({
      where: { id: BigInt(sessionId) },
    });

    // Payer debited exactly the charged amount, not 20 times
    expect(payerBefore.walletBalance - payerAfter.walletBalance).toBe(
      finishedSession.coinsCharged,
    );
    // Star user credited exactly the gemsCredited amount, not 20 times
    expect(starAfter.gems - starBefore.gems).toBe(
      finishedSession.gemsCredited,
    );

    // Ensure ledger records are not duplicated
    const ledgerRows = await prisma.coinTransaction.findMany({
      where: {
        userId: BigInt(payer.id),
        type: 'STAR_CHAT',
        referenceId: `star_chat_${sessionId}`,
      },
    });
    expect(ledgerRows).toHaveLength(1);
  });
});

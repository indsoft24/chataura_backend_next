import { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  authHeader,
  createTestApp,
  parse,
  prisma,
  registerVerified,
  setRole,
} from './e2e.helpers';

describe('Security & Authorization Audit (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('JWT & RBAC Security', () => {
    it('1. No JWT returns 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
      });
      expect(res.statusCode).toBe(401);
      const body = parse(res.payload);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('UNAUTHORIZED');
    });

    it('2. Invalid JWT signature returns 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: { authorization: 'Bearer invalid.token.payload.signature' },
      });
      expect(res.statusCode).toBe(401);
      const body = parse(res.payload);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('UNAUTHORIZED');
    });

    it('3. Expired or malformed bearer header returns 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: { authorization: 'Bearer ' },
      });
      expect(res.statusCode).toBe(401);
      const body = parse(res.payload);
      expect(body.success).toBe(false);
    });

    it('4. Normal user accessing admin endpoints is 403 FORBIDDEN', async () => {
      const normalUser = await registerVerified(app);
      const endpoints = [
        { method: 'GET' as const, url: '/api/v1/admin/dashboard' },
        { method: 'GET' as const, url: '/api/v1/admin/users' },
        { method: 'GET' as const, url: '/api/v1/admin/staff' },
      ];

      for (const ep of endpoints) {
        const res = await app.inject({
          method: ep.method,
          url: ep.url,
          headers: authHeader(normalUser.token),
        });
        expect(res.statusCode).toBe(403);
        const body = parse(res.payload);
        expect(body.success).toBe(false);
        expect(body.error?.code).toBe('FORBIDDEN');
      }
    });

    it('5. Normal user cannot perform admin-only management actions', async () => {
      const normalUser = await registerVerified(app);
      const targetUser = await registerVerified(app);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/users/${targetUser.id}/suspend`,
        headers: authHeader(normalUser.token),
        payload: { reason: 'malicious attempt' },
      });
      expect(res.statusCode).toBe(403);
      expect(parse(res.payload).error?.code).toBe('FORBIDDEN');
    });

    it('6. Suspended and deleted users cannot access protected resources', async () => {
      const user = await registerVerified(app);

      // Suspend user
      await prisma.user.update({
        where: { id: BigInt(user.id) },
        data: { isSuspended: true, accountStatus: 'suspended' },
      });

      const resSuspended = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: authHeader(user.token),
      });
      expect(resSuspended.statusCode).toBe(403);
      expect(parse(resSuspended.payload).error?.code).toBe('ACCOUNT_SUSPENDED');

      // Deleted user
      await prisma.user.update({
        where: { id: BigInt(user.id) },
        data: { accountStatus: 'deleted' },
      });

      const resDeleted = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: authHeader(user.token),
      });
      expect(resDeleted.statusCode).toBe(401);
      expect(parse(resDeleted.payload).success).toBe(false);
    });
  });

  describe('Payload Fuzzing & Input Validation', () => {
    it('Rejects negative and zero transfer amounts', async () => {
      const seller = await registerVerified(app);
      const recipient = await registerVerified(app);
      await setRole(seller.id, 'seller');

      // Negative amount
      const resNeg = await app.inject({
        method: 'POST',
        url: '/api/v1/wallet/transfer',
        headers: authHeader(seller.token),
        payload: { receiver_id: recipient.id, coin_amount: -500 },
      });
      expect(resNeg.statusCode).toBe(400);
      expect(parse(resNeg.payload).error?.code).toBe('INVALID_AMOUNT');

      // Zero amount
      const resZero = await app.inject({
        method: 'POST',
        url: '/api/v1/wallet/transfer',
        headers: authHeader(seller.token),
        payload: { receiver_id: recipient.id, coin_amount: 0 },
      });
      expect(resZero.statusCode).toBe(400);
      expect(parse(resZero.payload).error?.code).toBe('INVALID_AMOUNT');
    });

    it('Rejects negative gem conversion amount', async () => {
      const user = await registerVerified(app);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/wallet/gems/convert',
        headers: authHeader(user.token),
        payload: { gems_amount: -50, currency: 'COINS' },
      });
      expect(res.statusCode).toBe(400);
      expect(parse(res.payload).success).toBe(false);
    });

    it('Rejects negative and invalid game bet amounts', async () => {
      const user = await registerVerified(app);
      const resNeg = await app.inject({
        method: 'POST',
        url: '/api/v1/game/greedy/bet',
        headers: authHeader(user.token),
        payload: { item: 'carrot', amount: -100 },
      });
      expect(resNeg.statusCode).toBe(400);
      expect(parse(resNeg.payload).error?.code).toBe('INVALID_AMOUNT');

      const resInvalidItem = await app.inject({
        method: 'POST',
        url: '/api/v1/game/greedy/bet',
        headers: authHeader(user.token),
        payload: { item: 'malicious_sql_inject', amount: 100 },
      });
      expect(resInvalidItem.statusCode).toBe(400);
      expect(parse(resInvalidItem.payload).error?.code).toBe('INVALID_ITEM');
    });

    it('Rejects missing required fields without crashing', async () => {
      const user = await registerVerified(app);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/wallet/send-gift',
        headers: authHeader(user.token),
        payload: {},
      });
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      const body = parse(res.payload);
      expect(body.success).toBe(false);
    });

    it('Rejects malformed JSON with 400 Bad Request', async () => {
      const user = await registerVerified(app);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/wallet/transfer',
        headers: {
          ...authHeader(user.token),
          'content-type': 'application/json',
        },
        payload: '{"receiver_id": 123, "coin_amount": ',
      });
      expect(res.statusCode).toBe(400);
    });

    it('Does not leak internal database errors or stack traces in error responses', async () => {
      const user = await registerVerified(app);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/wallet/transfer',
        headers: authHeader(user.token),
        payload: {
          receiver_id: '9999999999999999999999999999999999',
          coin_amount: 100,
        },
      });
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      const raw = res.payload;
      expect(raw).not.toContain('prisma');
      expect(raw).not.toContain('SELECT');
      expect(raw).not.toContain('stack');
      expect(raw).not.toContain('password');
      expect(raw).not.toContain('DATABASE_URL');
    });
  });
});

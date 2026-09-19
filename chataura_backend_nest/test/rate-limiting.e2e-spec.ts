import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { authHeader, createTestApp, parse, registerVerified } from './e2e.helpers';

describe('Rate Limiting & Throttling (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Strict Rate Limiting on Sensitive Auth Endpoints', () => {
    it('enforces limit of 3 on /auth/forgot-password and returns 429 on 4th attempt', async () => {
      const clientIp = '198.51.100.77';

      // First 3 requests must be allowed through
      for (let i = 1; i <= 3; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/forgot-password',
          headers: {
            'x-forwarded-for': clientIp,
          },
          payload: {
            email: `test_forgot_${i}@chataura.local`,
          },
        });
        expect(res.statusCode).not.toBe(429);
      }

      // 4th request MUST be blocked with HTTP 429 TOO_MANY_REQUESTS
      const blockedRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/forgot-password',
        headers: {
          'x-forwarded-for': clientIp,
        },
        payload: {
          email: 'test_forgot_4@chataura.local',
        },
      });

      expect(blockedRes.statusCode).toBe(429);
      const body = parse(blockedRes.payload);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('TOO_MANY_REQUESTS');
      expect(blockedRes.headers['retry-after']).toBeDefined();
    });

    it('isolates rate limits by client IP so another IP is not blocked', async () => {
      const freshClientIp = '203.0.113.88';

      // Request from fresh IP should not be blocked
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/forgot-password',
        headers: {
          'x-forwarded-for': freshClientIp,
        },
        payload: {
          email: 'fresh_ip_user@chataura.local',
        },
      });

      expect(res.statusCode).not.toBe(429);
    });

    it('enforces limit of 5 on /auth/login and returns 429 on 6th attempt', async () => {
      const loginClientIp = '198.51.100.88';

      for (let i = 1; i <= 5; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          headers: {
            'x-forwarded-for': loginClientIp,
          },
          payload: {
            identity: `nonexistent_${i}@chataura.local`,
            password: 'Password123!',
          },
        });
        expect(res.statusCode).not.toBe(429);
      }

      const blockedRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: {
          'x-forwarded-for': loginClientIp,
        },
        payload: {
          identity: 'nonexistent_6@chataura.local',
          password: 'Password123!',
        },
      });

      expect(blockedRes.statusCode).toBe(429);
      const body = parse(blockedRes.payload);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('TOO_MANY_REQUESTS');
    });

    it('enforces limit of 5 on /auth/register and returns 429 on 6th attempt', async () => {
      const regClientIp = '198.51.100.99';

      for (let i = 1; i <= 5; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/register',
          headers: {
            'x-forwarded-for': regClientIp,
          },
          payload: {
            email: `bulk_reg_${i}_${Date.now()}@chataura.local`,
            password: 'Password123!',
            name: `User ${i}`,
          },
        });
        expect(res.statusCode).not.toBe(429);
      }

      const blockedRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        headers: {
          'x-forwarded-for': regClientIp,
        },
        payload: {
          email: `bulk_reg_6_${Date.now()}@chataura.local`,
          password: 'Password123!',
          name: 'User 6',
        },
      });

      expect(blockedRes.statusCode).toBe(429);
      expect(parse(blockedRes.payload).error?.code).toBe('TOO_MANY_REQUESTS');
    });
  });

  describe('Authenticated Endpoints & Reverse-Proxy IP Bypass Prevention', () => {
    it('prevents rate-limit bypass via IP rotation for authenticated user', async () => {
      const authed = await registerVerified(app);

      // Endpoint: /wallet/referral/convert has limit: 5
      for (let i = 1; i <= 5; i++) {
        // Attacker attempts to cycle IP on every request:
        const spoofedIp = `10.20.${i}.100`;
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/wallet/referral/convert',
          headers: {
            ...authHeader(authed.token),
            'x-forwarded-for': spoofedIp,
          },
        });
        expect(res.statusCode).not.toBe(429);
      }

      // 6th attempt with yet another spoofed IP must be BLOCKED because tracker binds to usr_{id}
      const blockedRes = await app.inject({
        method: 'POST',
        url: '/api/v1/wallet/referral/convert',
        headers: {
          ...authHeader(authed.token),
          'x-forwarded-for': '10.20.99.100',
        },
      });

      expect(blockedRes.statusCode).toBe(429);
      const body = parse(blockedRes.payload);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('TOO_MANY_REQUESTS');
    });
  });

  describe('High-Frequency Legitimate Heartbeat & Sync Safety', () => {
    it('allows high-frequency room heartbeats without premature rate-limiting', async () => {
      const authed = await registerVerified(app);
      const roomId = 'room_hb_test_1';

      // Ensure room exists
      await app.inject({
        method: 'POST',
        url: '/api/v1/rooms',
        headers: authHeader(authed.token),
        payload: { title: 'Heartbeat Test Room', max_seats: 8 },
      });

      // Send 15 consecutive heartbeats; must NOT trigger 429
      for (let i = 0; i < 15; i++) {
        const res = await app.inject({
          method: 'POST',
          url: `/api/v1/rooms/${roomId}/heartbeat`,
          headers: authHeader(authed.token),
        });
        expect(res.statusCode).not.toBe(429);
      }
    });
  });
});

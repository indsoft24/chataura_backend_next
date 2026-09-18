import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { RedisService } from '../src/common/redis/redis.service';
import { createTestApp, parse } from './e2e.helpers';

describe('Health (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health returns phase 6 envelope and dependencies up', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    const body = parse<{
      status: string;
      phase: number;
      checks: { postgres: string; redis: string };
    }>(res.payload);
    expect(body.success).toBe(true);
    expect(body.data?.status).toBe('ok');
    expect(body.data?.phase).toBe(6);
    expect(body.data?.checks.postgres).toBe('up');
    expect(body.data?.checks.redis).toBe('up');
  });

  it('GET /api/v1/health/liveness and readiness endpoints work', async () => {
    const live = await app.inject({ method: 'GET', url: '/api/v1/health/liveness' });
    expect(live.statusCode).toBe(200);
    expect(parse(live.payload).data?.status).toBe('ok');

    const ready = await app.inject({ method: 'GET', url: '/api/v1/health/readiness' });
    expect(ready.statusCode).toBe(200);
    expect(parse(ready.payload).data?.status).toBe('ok');
  });

  it('GET /api/v1/health returns 503 when postgres is unavailable without leaking credentials', async () => {
    const prisma = app.get(PrismaService);
    const spy = jest.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('connection refused'));

    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(503);
    const body = parse<{
      status: string;
      checks: { postgres: string; redis: string };
    }>(res.payload);
    expect(body.data?.status).toBe('degraded');
    expect(body.data?.checks.postgres).toBe('down');

    // Ensure no credentials or URLs are leaked
    expect(res.payload).not.toContain('password');
    expect(res.payload).not.toContain('DATABASE_URL');
    expect(res.payload).not.toContain('5433');
    spy.mockRestore();
  });

  it('GET /api/v1/health returns 503 when redis is unavailable', async () => {
    const redis = app.get(RedisService);
    const spy = jest.spyOn(redis, 'ping').mockRejectedValueOnce(new Error('redis unreachable'));

    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(503);
    const body = parse<{
      status: string;
      checks: { postgres: string; redis: string };
    }>(res.payload);
    expect(body.data?.status).toBe('degraded');
    expect(body.data?.checks.redis).toBe('down');
    spy.mockRestore();
  });

  it('unauthenticated protected route is 401 UNAUTHORIZED', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/users/me' });
    expect(res.statusCode).toBe(401);
    const body = parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('UNAUTHORIZED');
  });
});

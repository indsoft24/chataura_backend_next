import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp, parse } from './e2e.helpers';

describe('Health (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health returns phase 6 envelope', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    const body = parse<{ status: string; phase: number }>(res.payload);
    expect(body.success).toBe(true);
    expect(body.data?.status).toBe('ok');
    expect(body.data?.phase).toBe(6);
  });

  it('unauthenticated protected route is 401 UNAUTHORIZED', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/users/me' });
    expect(res.statusCode).toBe(401);
    const body = parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('UNAUTHORIZED');
  });
});

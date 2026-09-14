import { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  authHeader,
  createTestApp,
  parse,
  prisma,
  registerVerified,
  uniqueGmail,
} from './e2e.helpers';

describe('Auth / User (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects non-Gmail register', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'not.gmail@yahoo.com',
        password: 'secret12',
      },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    const body = parse(res.payload);
    expect(body.success).toBe(false);
  });

  it('register, login, refresh, OTP skip via dev_otp', async () => {
    const user = await registerVerified(app);
    expect(user.token).toBeTruthy();

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: user.email, password: user.password },
    });
    const logged = parse<{ access_token: string }>(login.payload);
    expect(logged.success).toBe(true);
    expect(logged.data?.access_token).toBeTruthy();

    const refresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refresh_token: user.refresh },
    });
    const refreshed = parse<{ access_token: string }>(refresh.payload);
    expect(refreshed.success).toBe(true);
    expect(refreshed.data?.access_token).toBeTruthy();
  });

  it('follow / friend / block', async () => {
    const a = await registerVerified(app, { name: 'Alpha' });
    const b = await registerVerified(app, { name: 'Beta' });

    const follow = await app.inject({
      method: 'POST',
      url: '/api/v1/users/follow',
      headers: authHeader(a.token),
      payload: { user_id: b.id },
    });
    expect(parse(follow.payload).success).toBe(true);

    const friend = await app.inject({
      method: 'POST',
      url: '/api/v1/user/friend-request',
      headers: authHeader(a.token),
      payload: { user_id: b.id },
    });
    expect(parse(friend.payload).success).toBe(true);

    const accept = await app.inject({
      method: 'POST',
      url: '/api/v1/user/accept-friend',
      headers: authHeader(b.token),
      payload: { user_id: a.id },
    });
    expect(parse(accept.payload).success).toBe(true);

    const block = await app.inject({
      method: 'POST',
      url: '/api/v1/user/block',
      headers: authHeader(a.token),
      payload: { user_id: b.id },
    });
    expect(parse(block.payload).success).toBe(true);
  });

  it('unverified email is 403 EMAIL_NOT_VERIFIED', async () => {
    const email = uniqueGmail('unverified');
    const register = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email, password: 'secret12' },
    });
    const token = parse<{ access_token: string }>(register.payload).data!
      .access_token;
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/wallet/packages',
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(403);
    expect(parse(res.payload).error?.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('suspended account is 403 ACCOUNT_SUSPENDED', async () => {
    const user = await registerVerified(app);
    await prisma.user.update({
      where: { id: BigInt(user.id) },
      data: { isSuspended: true, accountStatus: 'suspended' },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users/me',
      headers: authHeader(user.token),
    });
    expect(res.statusCode).toBe(403);
    expect(parse(res.payload).error?.code).toBe('ACCOUNT_SUSPENDED');
  });
});

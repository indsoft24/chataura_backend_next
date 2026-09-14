import { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  authHeader,
  createTestApp,
  parse,
  registerVerified,
  setRole,
} from './e2e.helpers';

describe('Media / agency / admin (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('feed envelope + like/comment', async () => {
    const user = await registerVerified(app);
    const upload = await app.inject({
      method: 'POST',
      url: '/api/v1/posts/upload',
      headers: authHeader(user.token),
      payload: {
        file_url: 'https://cdn.chataura.local/p6.jpg',
        caption: 'phase 6',
        media_type: 'image',
      },
    });
    const created = parse<{ id: number }>(upload.payload);
    expect(created.success).toBe(true);
    const postId = created.data!.id;

    const feed = await app.inject({
      method: 'GET',
      url: '/api/v1/posts/feed',
      headers: authHeader(user.token),
    });
    const body = parse<unknown[]>(feed.payload);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.current_page).toBe(1);
    expect(typeof body.has_more).toBe('boolean');

    const like = await app.inject({
      method: 'POST',
      url: `/api/v1/posts/${postId}/like`,
      headers: authHeader(user.token),
      payload: {},
    });
    expect(parse(like.payload).success).toBe(true);

    const comment = await app.inject({
      method: 'POST',
      url: `/api/v1/posts/${postId}/comment`,
      headers: authHeader(user.token),
      payload: { comment: 'nice' },
    });
    expect(parse(comment.payload).success).toBe(true);
  });

  it('agency join / accept / weekly pay', async () => {
    const agency = await registerVerified(app, { name: 'Agency' });
    const owner = await registerVerified(app, { name: 'Owner' });
    await setRole(agency.id, 'agency');

    const join = await app.inject({
      method: 'POST',
      url: '/api/v1/agency/join',
      headers: authHeader(owner.token),
      payload: { agency_user_id: agency.id },
    });
    const joined = parse<{ id: number }>(join.payload);
    expect(joined.success).toBe(true);

    const requests = await app.inject({
      method: 'GET',
      url: '/api/v1/agency/requests',
      headers: authHeader(agency.token),
    });
    const reqs = parse<{ requests?: Array<{ id: number }>; id?: number }>(
      requests.payload,
    );
    expect(reqs.success).toBe(true);
    const requestId =
      joined.data?.id ??
      (reqs.data as { requests?: Array<{ id: number }> })?.requests?.[0]?.id ??
      (Array.isArray(reqs.data)
        ? (reqs.data as Array<{ id: number }>)[0]?.id
        : undefined);
    expect(requestId).toBeTruthy();

    const accept = await app.inject({
      method: 'POST',
      url: `/api/v1/agency/requests/${requestId}/accept`,
      headers: authHeader(agency.token),
      payload: {},
    });
    expect(parse(accept.payload).success).toBe(true);

    const weekly = await app.inject({
      method: 'GET',
      url: '/api/v1/agency/weekly',
      headers: authHeader(agency.token),
    });
    const week = parse<{ distributions: Array<{ id: number }> }>(weekly.payload);
    expect(week.success).toBe(true);
    const distId = week.data?.distributions?.[0]?.id;
    if (distId) {
      const pay = await app.inject({
        method: 'POST',
        url: `/api/v1/agency/weekly/${distId}/approve`,
        headers: authHeader(agency.token),
        payload: { approved_gems: 5 },
      });
      const paid = parse<{ status: string; approved_gems: number }>(pay.payload);
      expect(paid.success).toBe(true);
      expect(paid.data?.status).toBe('paid');
    }
  });

  it('non-admin /admin/* is forbidden', async () => {
    const user = await registerVerified(app);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/dashboard',
      headers: authHeader(user.token),
    });
    expect(res.statusCode).toBe(403);
    expect(parse(res.payload).error?.code).toBe('FORBIDDEN');
  });
});

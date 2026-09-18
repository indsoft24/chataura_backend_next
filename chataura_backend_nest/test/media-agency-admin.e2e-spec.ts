import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { existsSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';
import { Readable } from 'stream';
import { MediaService } from '../src/modules/media/media.service';
import {
  authHeader,
  createTestApp,
  parse,
  prisma,
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
    const week = parse<{ distributions: Array<{ id: number }> }>(
      weekly.payload,
    );
    expect(week.success).toBe(true);
    const distId = week.data?.distributions?.[0]?.id;
    if (distId) {
      const pay = await app.inject({
        method: 'POST',
        url: `/api/v1/agency/weekly/${distId}/approve`,
        headers: authHeader(agency.token),
        payload: { approved_gems: 5 },
      });
      const paid = parse<{ status: string; approved_gems: number }>(
        pay.payload,
      );
      expect(paid.success).toBe(true);
      expect(paid.data?.status).toBe('paid');

      // Verify immutable ledger audit record was created
      const distTx = await prisma.coinTransaction.findMany({
        where: {
          userId: BigInt(owner.id),
          type: 'AGENCY_WEEKLY_PAYOUT',
          referenceId: `agency_dist_${distId}`,
        },
      });
      expect(distTx).toHaveLength(1);
      expect(Number(distTx[0].netAmount)).toBe(5);
      expect(distTx[0].status).toBe('success');
    }
  });

  it('concurrent agency weeklyApprove requests execute exactly once without double credit', async () => {
    const agency = await registerVerified(app, { name: 'AgencyBoss' });
    const owner = await registerVerified(app, { name: 'RoomHost' });
    await setRole(agency.id, 'agency');

    const initialGems = (
      await prisma.user.findUniqueOrThrow({ where: { id: BigInt(owner.id) } })
    ).gems;

    // Create a pending distribution directly
    const dist = await prisma.agencyWeeklyDistribution.create({
      data: {
        periodId: BigInt(Date.now()),
        agencyUserId: BigInt(agency.id),
        roomOwnerId: BigInt(owner.id),
        weekStart: new Date(Date.now() - 7 * 86400000),
        weekEnd: new Date(),
        suggestedGems: 100,
        status: 'pending',
      },
    });

    // Fire 20 concurrent approval requests
    const approveCalls = Array.from({ length: 20 }, () =>
      app.inject({
        method: 'POST',
        url: `/api/v1/agency/weekly/${dist.id}/approve`,
        headers: authHeader(agency.token),
        payload: { approved_gems: 100 },
      }),
    );

    const results = await Promise.all(approveCalls);
    const successes = results.filter((r) => parse(r.payload).success === true);
    const settled = results.filter(
      (r) => parse(r.payload).error?.code === 'ALREADY_SETTLED',
    );

    expect(successes).toHaveLength(1);
    expect(settled).toHaveLength(19);

    // Verify balance: X + 100
    const finalOwner = await prisma.user.findUniqueOrThrow({
      where: { id: BigInt(owner.id) },
    });
    expect(finalOwner.gems).toBe(initialGems + 100n);

    // Repeat approval serially -> must be rejected as ALREADY_SETTLED
    const repeat = await app.inject({
      method: 'POST',
      url: `/api/v1/agency/weekly/${dist.id}/approve`,
      headers: authHeader(agency.token),
      payload: { approved_gems: 100 },
    });
    expect(repeat.statusCode).toBe(400);
    expect(parse(repeat.payload).error?.code).toBe('ALREADY_SETTLED');

    // Balance remains exactly X + 100
    const afterRepeat = await prisma.user.findUniqueOrThrow({
      where: { id: BigInt(owner.id) },
    });
    expect(afterRepeat.gems).toBe(initialGems + 100n);

    // Verify exactly one ledger audit record
    const auditRows = await prisma.coinTransaction.findMany({
      where: {
        userId: BigInt(owner.id),
        type: 'AGENCY_WEEKLY_PAYOUT',
        referenceId: `agency_dist_${dist.id}`,
      },
    });
    expect(auditRows).toHaveLength(1);
    expect(Number(auditRows[0].netAmount)).toBe(100);
    expect(auditRows[0].status).toBe('success');
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

  it('admin /admin/dashboard returns complete live metrics payload', async () => {
    const admin = await registerVerified(app);
    await setRole(admin.id, 'admin');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/dashboard',
      headers: authHeader(admin.token),
    });
    expect(res.statusCode).toBe(200);
    const body = parse<{
      users: number;
      live_rooms: number;
      coin_burn_today: number;
      recharge_today: number;
      revenue_today: number;
      revenue_this_week: number;
      coin_tx_count: number;
      gross_volume: number;
      net_volume: number;
      commission_total: number;
      gift_volume: number;
      admin_credits: number;
      reports: number;
      pending_withdrawals: number;
      recent_commissions: Array<{ date: string; transactions: number; commission: number }>;
    }>(res.payload);
    expect(body.success).toBe(true);
    expect(typeof body.data?.users).toBe('number');
    expect(typeof body.data?.revenue_today).toBe('number');
    expect(typeof body.data?.revenue_this_week).toBe('number');
    expect(typeof body.data?.coin_tx_count).toBe('number');
    expect(Array.isArray(body.data?.recent_commissions)).toBe(true);
  });

  it('media upload security: neutralizes path traversal, enforces MIME whitelist, and safely streams', async () => {
    const mediaService = app.get(MediaService);

    // 1. Path traversal attempt in filename
    const maliciousFilename = '../../../../../../etc/passwd';
    const fakeStream = Readable.from(['root:x:0:0:root:/root:/bin/bash\n']);
    const savedUrl = await mediaService.storeLocalFile(maliciousFilename, fakeStream);

    // Verify it saved strictly inside uploads dir with neutralized basename
    expect(savedUrl).toContain('/uploads/');
    expect(savedUrl).not.toContain('..');
    const savedBasename = savedUrl.split('/uploads/')[1];
    const fullPath = join(resolve(process.cwd(), 'uploads'), savedBasename);
    expect(existsSync(fullPath)).toBe(true);
    expect(fullPath.startsWith(resolve(process.cwd(), 'uploads'))).toBe(true);
    unlinkSync(fullPath);

    // 2. MIME type whitelist verification
    const reqMaliciousMime = {
      file: async () => ({
        mimetype: 'application/x-php',
        filename: 'shell.php',
        file: Readable.from(['<?php phpinfo(); ?>']),
      }),
    };
    const rejectedResult = await mediaService.storeFromRequest(reqMaliciousMime, 'fallback_url');
    expect(rejectedResult).toBe('fallback_url');

    // Empty MIME
    const reqEmptyMime = {
      file: async () => ({
        mimetype: '',
        filename: 'unknown.bin',
        file: Readable.from(['data']),
      }),
    };
    const emptyResult = await mediaService.storeFromRequest(reqEmptyMime, 'fallback_url');
    expect(emptyResult).toBe('fallback_url');

    // Valid MIME
    const reqValidMime = {
      file: async () => ({
        mimetype: 'image/png',
        filename: 'avatar.png',
        file: Readable.from(['fake_png_binary']),
      }),
    };
    const validResult = await mediaService.storeFromRequest(reqValidMime, 'fallback_url');
    expect(validResult).not.toBe('fallback_url');
    expect(validResult).toContain('/uploads/');
    const validBasename = validResult!.split('/uploads/')[1];
    const validPath = join(resolve(process.cwd(), 'uploads'), validBasename);
    if (existsSync(validPath)) unlinkSync(validPath);
  });
});

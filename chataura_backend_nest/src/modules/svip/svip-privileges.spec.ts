import { assertSvipLevel } from './svip-gates';
import { countsAsNewVisit, recordVisit } from './svip-visits';

const HOUR = 3_600_000;

describe('visitor records', () => {
  it('counts a revisit only after 24 h', () => {
    const now = new Date('2026-10-27T12:00:00Z');
    expect(countsAsNewVisit(null, now)).toBe(true);
    expect(countsAsNewVisit(new Date(now.getTime() - 23 * HOUR), now)).toBe(
      false,
    );
    expect(countsAsNewVisit(new Date(now.getTime() - 24 * HOUR), now)).toBe(
      true,
    );
  });

  it('first visit creates the row; quick revisit refreshes time without counting', async () => {
    const rows: any[] = [];
    const tx: any = {
      userVisit: {
        findUnique: async () => rows[0] ?? null,
        create: async ({ data }: any) => rows.push({ visitCount: 1, ...data }),
        update: async ({ data }: any) => {
          rows[0].lastVisitedAt = data.lastVisitedAt;
          if (data.visitCount) rows[0].visitCount += data.visitCount.increment;
        },
      },
    };
    const t0 = new Date('2026-10-27T00:00:00Z');
    await recordVisit(tx, 1n, 2n, t0);
    await recordVisit(tx, 1n, 2n, new Date(t0.getTime() + HOUR));
    expect(rows[0]).toMatchObject({ visitCount: 1 });
    await recordVisit(tx, 1n, 2n, new Date(t0.getTime() + 25 * HOUR));
    expect(rows[0].visitCount).toBe(2);
  });
});

describe('assertSvipLevel', () => {
  const tx = (row: any) =>
    ({ userSvip: { findUnique: async () => row } }) as any;
  const code = (p: Promise<unknown>) =>
    p.then(
      () => 'ok',
      (e: any) => e.getResponse().error.code,
    );

  it('passes members at or above the level, and anyone when nothing is required', async () => {
    const m = {
      level: 1,
      status: 'active',
      bubbleOn: true,
      roomCardOn: true,
      micWaveOn: true,
    };
    expect(await code(assertSvipLevel(tx(m), 1n, 1, 'x'))).toBe('ok');
    expect(await code(assertSvipLevel(tx(null), 1n, 0, 'x'))).toBe('ok');
  });

  it('rejects non-members, expired members and lower levels', async () => {
    const m = {
      level: 1,
      status: 'active',
      bubbleOn: true,
      roomCardOn: true,
      micWaveOn: true,
    };
    expect(await code(assertSvipLevel(tx(null), 1n, 1, 'x'))).toBe(
      'SVIP_REQUIRED',
    );
    expect(
      await code(assertSvipLevel(tx({ ...m, status: 'expired' }), 1n, 1, 'x')),
    ).toBe('SVIP_REQUIRED');
    expect(await code(assertSvipLevel(tx(m), 1n, 2, 'x'))).toBe(
      'SVIP_REQUIRED',
    );
  });
});

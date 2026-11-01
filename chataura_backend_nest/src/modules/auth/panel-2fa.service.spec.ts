// The real modules pull in ESM-only packages that this jest setup cannot load; the service only needs their types.
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../../common/redis/redis.service', () => ({ RedisService: class {} }));
jest.mock('./otp.service', () => ({ OtpService: class {} }));

import { Panel2faService } from './panel-2fa.service';

function fakeRedis() {
  const m = new Map<string, string>();
  const c = {
    get: async (k: string) => m.get(k) ?? null,
    set: async (k: string, v: string) => (m.set(k, v), 'OK'),
    del: async (k: string) => (m.delete(k) ? 1 : 0),
    incr: async (k: string) => {
      const n = Number(m.get(k) ?? 0) + 1;
      m.set(k, String(n));
      return n;
    },
    expire: async () => 1,
  };
  return { getClient: () => c };
}

describe('Panel2faService', () => {
  const user: any = { id: 7n, email: 'a@x.com', role: 'admin', staffBadgeType: 'admin' };
  let sentCode = '';
  let sentTo: string[] = [];
  const otp: any = {
    generateOtp: () => '424242',
    sendPanelCode: async (to: string[], code: string) => {
      sentTo = to;
      sentCode = code;
    },
  };
  const config: any = { get: (k: string, d?: string) => (k === 'JWT_SECRET' ? 'secret' : d) };
  const make = () => new Panel2faService({} as any, fakeRedis() as any, config, otp);

  it('accepts the right code once', async () => {
    const s = make();
    const ch = await s.start(user);
    expect(sentTo).toEqual(['a@x.com']);
    expect(await s.verify(ch.challenge_id, sentCode)).toBe(7n);
    await expect(s.verify(ch.challenge_id, sentCode)).rejects.toBeTruthy();
  });

  it('kills the challenge after 5 wrong guesses, even if the right code follows', async () => {
    const s = make();
    const ch = await s.start(user);
    for (let i = 0; i < 5; i++) await expect(s.verify(ch.challenge_id, '000000')).rejects.toBeTruthy();
    await expect(s.verify(ch.challenge_id, sentCode)).rejects.toBeTruthy();
  });

  it('limits mails per hour, resends and password tries', async () => {
    const s = make();
    for (let i = 0; i < 6; i++) await s.start(user);
    await expect(s.start(user)).rejects.toMatchObject({ status: 429 });
    const s2 = make();
    const ch = await s2.start(user);
    await expect(s2.resend(ch.challenge_id)).rejects.toMatchObject({ status: 429 }); // 60 s cooldown
    for (let i = 0; i < 10; i++) await s2.passwordFailed('a@x.com');
    await expect(s2.guardPassword('a@x.com')).rejects.toMatchObject({ status: 429 });
    await s2.passwordOk('a@x.com');
    await expect(s2.guardPassword('a@x.com')).resolves.toBeUndefined();
  });

  it('rejects a malformed challenge id', async () => {
    await expect(make().verify('nope', '123456')).rejects.toBeTruthy();
  });
});

jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
import { createHmac } from 'crypto';
import { AgoraService } from './agora.service';

const svc = (env: Record<string, string>) =>
  new AgoraService({ get: (k: string, d?: string) => env[k] ?? d } as never);

describe('AgoraService provider', () => {
  it('stays agora by default', () => {
    const t = svc({}).buildToken('room_1', 7, true);
    expect(t.provider).toBe('agora');
    expect(t.agora_uid).toBe(7);
  });

  it('stays agora when livekit is requested but not fully configured', () => {
    expect(svc({ RTC_PROVIDER: 'livekit' }).buildToken('room_1', 7, true).provider).toBe('agora');
  });

  it('signs a livekit token whose publish right follows the role', () => {
    const env = { RTC_PROVIDER: 'livekit', LIVEKIT_URL: 'wss://x', LIVEKIT_API_KEY: 'k', LIVEKIT_API_SECRET: 's' };
    for (const publisher of [true, false]) {
      const t = svc(env).buildToken('room_1', 7, publisher) as { provider: string; url: string; token: string; agora_token: string };
      expect(t.provider).toBe('livekit');
      expect(t.agora_token).toBeTruthy();
      const [h, b, sig] = t.token.split('.');
      expect(createHmac('sha256', 's').update(`${h}.${b}`).digest('base64url')).toBe(sig);
      const p = JSON.parse(Buffer.from(b, 'base64url').toString());
      expect(p).toMatchObject({ iss: 'k', sub: '7', video: { room: 'room_1', canPublish: publisher, canSubscribe: true } });
    }
  });
});

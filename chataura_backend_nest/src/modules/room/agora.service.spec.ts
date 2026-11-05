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

  it('stays agora when livekit is not fully configured', () => {
    expect(svc({ LIVEKIT_URL: 'wss://x' }).buildToken('room_1', 7, true).provider).toBe('agora');
  });

  it('prefers livekit when configured, agora only when forced', () => {
    const lk = { LIVEKIT_URL: 'wss://x', LIVEKIT_API_KEY: 'k', LIVEKIT_API_SECRET: 's' };
    expect(svc(lk).buildToken('room_1', 7, true).provider).toBe('livekit');
    expect(svc({ ...lk, RTC_PROVIDER: 'agora' }).buildToken('room_1', 7, true).provider).toBe('agora');
  });

  it('prefixes the livekit room name when LIVEKIT_ROOM_PREFIX is set', () => {
    const t = svc({ LIVEKIT_URL: 'wss://x', LIVEKIT_API_KEY: 'k', LIVEKIT_API_SECRET: 's', LIVEKIT_ROOM_PREFIX: 'stg_' }).buildToken('room_1', 7, true) as { token: string };
    expect(JSON.parse(Buffer.from(t.token.split('.')[1], 'base64url').toString()).video.room).toBe('stg_room_1');
  });

  it('signs a livekit token whose publish right follows the role', () => {
    const env = { LIVEKIT_URL: 'wss://x', LIVEKIT_API_KEY: 'k', LIVEKIT_API_SECRET: 's' };
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

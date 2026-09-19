import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { AppThrottlerGuard } from './app-throttler.guard';

describe('AppThrottlerGuard', () => {
  let guard: AppThrottlerGuard;
  let storage: ThrottlerStorageService;
  let reflector: Reflector;

  beforeEach(() => {
    storage = new ThrottlerStorageService();
    reflector = new Reflector();
    guard = new AppThrottlerGuard(
      {
        throttlers: [{ name: 'default', ttl: 60000, limit: 10 }],
      },
      storage,
      reflector,
    );
  });

  it('extracts authenticated user ID as tracker to prevent IP rotation bypass', async () => {
    const req = {
      user: { id: 42 },
      headers: { 'x-forwarded-for': '1.2.3.4' },
      ip: '1.2.3.4',
    };

    const tracker = await (guard as any).getTracker(req);
    expect(tracker).toBe('usr_42');
  });

  it('prefers cf-connecting-ip for unauthenticated requests', async () => {
    const req = {
      headers: {
        'cf-connecting-ip': '203.0.113.195',
        'x-real-ip': '198.51.100.1',
        'x-forwarded-for': '192.0.2.1, 10.0.0.1',
      },
      ip: '10.0.0.1',
    };

    const tracker = await (guard as any).getTracker(req);
    expect(tracker).toBe('ip_203.0.113.195');
  });

  it('prefers x-real-ip if cf-connecting-ip is not present', async () => {
    const req = {
      headers: {
        'x-real-ip': '198.51.100.1',
        'x-forwarded-for': '192.0.2.1, 10.0.0.1',
      },
      ip: '10.0.0.1',
    };

    const tracker = await (guard as any).getTracker(req);
    expect(tracker).toBe('ip_198.51.100.1');
  });

  it('uses first IP from x-forwarded-for if real-ip is not present', async () => {
    const req = {
      headers: {
        'x-forwarded-for': '192.0.2.55, 10.0.0.2',
      },
      ip: '10.0.0.2',
    };

    const tracker = await (guard as any).getTracker(req);
    expect(tracker).toBe('ip_192.0.2.55');
  });

  it('falls back to req.ip or 127.0.0.1 when no proxy headers exist', async () => {
    const req = {
      headers: {},
      ip: '127.0.0.1',
    };

    const tracker = await (guard as any).getTracker(req);
    expect(tracker).toBe('ip_127.0.0.1');
  });

  it('handles ws context gracefully without throwing', () => {
    const mockWsContext = {
      getType: () => 'ws',
      switchToWs: () => ({
        getClient: () => ({
          handshake: { headers: { 'x-real-ip': '10.10.10.10' } },
        }),
      }),
    } as unknown as ExecutionContext;

    const { req, res } = (guard as any).getRequestResponse(mockWsContext);
    expect(req).toBeDefined();
    expect(res).toBeDefined();
    expect(typeof res.header).toBe('function');
  });
});

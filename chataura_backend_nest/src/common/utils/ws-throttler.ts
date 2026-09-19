import { Socket } from 'socket.io';

class WsConnectionThrottler {
  private connections = new Map<string, { count: number; expiresAt: number }>();
  private readonly maxPerMinute: number;
  private readonly windowMs: number;

  constructor(maxPerMinute = 30, windowMs = 60000) {
    this.maxPerMinute = maxPerMinute;
    this.windowMs = windowMs;
  }

  isRateLimited(client: Socket): boolean {
    const handshake = client.handshake;
    const headers = handshake.headers || {};
    const ip =
      (typeof headers['cf-connecting-ip'] === 'string' && headers['cf-connecting-ip']) ||
      (typeof headers['x-real-ip'] === 'string' && headers['x-real-ip']) ||
      (typeof headers['x-forwarded-for'] === 'string' && headers['x-forwarded-for'].split(',')[0].trim()) ||
      handshake.address ||
      client.id;

    const now = Date.now();
    const entry = this.connections.get(ip);

    if (!entry || now > entry.expiresAt) {
      this.connections.set(ip, { count: 1, expiresAt: now + this.windowMs });
      return false;
    }

    entry.count += 1;
    if (entry.count > this.maxPerMinute) {
      return true;
    }

    return false;
  }
}

export const wsThrottler = new WsConnectionThrottler(30, 60000);

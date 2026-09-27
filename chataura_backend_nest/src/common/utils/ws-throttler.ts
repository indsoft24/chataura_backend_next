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

/**
 * Per-socket, per-event-type rate limiter.
 * Used to throttle specific high-frequency events (e.g. gift.send) independently
 * of the connection-level throttler above.
 *
 * Key: `${socketId}:${eventName}`
 * Config: maxRequests per windowMs (sliding window).
 */
class WsEventThrottler {
  private buckets = new Map<string, { count: number; windowStart: number }>();

  /**
   * Returns true if this socket+event combination has exceeded the allowed rate.
   * @param socketId  The socket.id of the client.
   * @param eventName The WS event name being rate-limited (e.g. 'gift.send').
   * @param maxRequests Max allowed calls within windowMs. Default 5.
   * @param windowMs  Sliding window length in ms. Default 1 000 ms.
   */
  isEventRateLimited(
    socketId: string,
    eventName: string,
    maxRequests = 5,
    windowMs = 1_000,
  ): boolean {
    const key = `${socketId}:${eventName}`;
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || now - bucket.windowStart >= windowMs) {
      this.buckets.set(key, { count: 1, windowStart: now });
      return false;
    }

    bucket.count += 1;
    if (bucket.count > maxRequests) {
      return true;
    }

    return false;
  }

  /** Evict stale buckets. Call periodically (e.g. every 60 s) to prevent unbounded growth. */
  evictStale(olderThanMs = 5_000): void {
    const cutoff = Date.now() - olderThanMs;
    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.windowStart < cutoff) this.buckets.delete(key);
    }
  }
}

export const wsThrottler = new WsConnectionThrottler(30, 60000);
export const wsEventThrottler = new WsEventThrottler();

// Evict stale event-throttle buckets every 60 s to keep memory bounded.
setInterval(() => wsEventThrottler.evictStale(5_000), 60_000);

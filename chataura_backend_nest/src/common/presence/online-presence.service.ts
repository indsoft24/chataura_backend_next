import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { LAST_SEEN_WRITE_INTERVAL_MS, ONLINE_WINDOW_MS } from './online-status';

/**
 * Keeps `users.is_online` / `users.last_seen_at` current from app and room heartbeats.
 * Writes are throttled per user through Redis (one DB write per minute at most); if Redis is
 * down, a conditional update keeps the write rate the same.
 */
@Injectable()
export class OnlinePresenceService {
  private readonly logger = new Logger(OnlinePresenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** The user is active right now (app foreground heartbeat, room heartbeat, login). */
  async touch(userId: bigint): Promise<void> {
    const throttleSec = Math.floor(LAST_SEEN_WRITE_INTERVAL_MS / 1000);
    try {
      const fresh = await this.redis
        .getClient()
        .set(`online_seen:${userId}`, '1', 'EX', throttleSec, 'NX');
      if (!fresh) return;
    } catch {
      /* Redis unavailable: fall through to the conditional DB write */
    }
    const now = new Date();
    const staleBefore = new Date(now.getTime() - LAST_SEEN_WRITE_INTERVAL_MS);
    await this.prisma.user
      .updateMany({
        where: {
          id: userId,
          deletedAt: null,
          OR: [
            { isOnline: false },
            { lastSeenAt: null },
            { lastSeenAt: { lt: staleBefore } },
          ],
        },
        data: { isOnline: true, lastSeenAt: now },
      })
      .catch((e: Error) =>
        this.logger.warn(`touch(${userId}) failed: ${e.message}`),
      );
  }

  /** Explicit sign-out: offline immediately (last seen = now). */
  async markOffline(userId: bigint): Promise<void> {
    await this.redis
      .getClient()
      .del(`online_seen:${userId}`)
      .catch(() => 0);
    await this.prisma.user
      .updateMany({
        where: { id: userId },
        data: { isOnline: false, lastSeenAt: new Date() },
      })
      .catch(() => null);
  }

  /** Users whose heartbeats stopped (app killed, network lost) go offline. */
  @Cron('*/1 * * * *')
  async sweepStale(): Promise<void> {
    const cutoff = new Date(Date.now() - ONLINE_WINDOW_MS);
    try {
      const res = await this.prisma.user.updateMany({
        where: {
          isOnline: true,
          OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: cutoff } }],
        },
        data: { isOnline: false },
      });
      if (res.count > 0) this.logger.debug(`marked ${res.count} users offline`);
    } catch (e) {
      this.logger.warn(`sweepStale failed: ${(e as Error).message}`);
    }
  }
}

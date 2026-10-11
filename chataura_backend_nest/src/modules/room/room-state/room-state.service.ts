import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { RealtimeService } from '../../../common/fcm/realtime.service';
import {
  LIVE_STATE_SCHEMA,
  LiveRoomState,
  LiveSeat,
  changedSeats,
  legacySeatEvent,
  stateHash,
} from './room-state.rules';

/** Builds a room's full live state from the database (no side effects). Null = room gone. */
export type LiveStateBuilder = (roomId: string) => Promise<LiveRoomState | null>;

const DEBOUNCE_MS = 250;
/** At most ~2 document writes per second per room (Firestore: ~1/s sustained per doc). */
const MIN_INTERVAL_MS = 500;
const LOCK_MS = 8_000;
const CACHE_TTL_S = 24 * 3600;
const SWEEP_BATCH = 200;

/**
 * Single writer of every room's live state.
 *
 * - Any change anywhere (join, leave, seat, mute, role, settings, eviction) calls [changed];
 *   bursts collapse into one publish ~250 ms later, built fresh from the database.
 * - A Redis lock per room means one publisher at a time across all API containers, so
 *   versions and documents are always published in order.
 * - The version lives in Postgres (rooms.state_version), strictly increasing and wall-clock
 *   floored, so it survives restarts / multiple instances and stays above any version a
 *   released app already holds.
 * - Identical content is never re-published (hash check), so the safety sweep is cheap.
 */
@Injectable()
export class RoomStateService implements OnModuleDestroy {
  private readonly logger = new Logger(RoomStateService.name);
  private builder: LiveStateBuilder | null = null;
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly lastPublishAt = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly realtime: RealtimeService,
  ) {}

  setBuilder(builder: LiveStateBuilder) {
    this.builder = builder;
  }

  onModuleDestroy() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  /** Something in this room changed — publish the new state shortly (coalesced). */
  changed(roomId: string, delayMs = DEBOUNCE_MS) {
    if (!roomId) return;
    const existing = this.timers.get(roomId);
    if (existing) clearTimeout(existing);
    const sinceLast = Date.now() - (this.lastPublishAt.get(roomId) ?? 0);
    const wait = Math.max(delayMs, MIN_INTERVAL_MS - sinceLast);
    this.timers.set(
      roomId,
      setTimeout(() => {
        this.timers.delete(roomId);
        void this.publishNow(roomId).catch((e) =>
          this.logger.error(`publish(${roomId}) failed: ${String(e)}`),
        );
      }, wait),
    );
  }

  /** Current published version (GET /seats, join responses). 0 = never published. */
  async currentVersion(roomId: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ state_version: bigint }>>`
      SELECT state_version FROM rooms WHERE id = ${roomId}::uuid`;
    return Number(rows[0]?.state_version ?? 0n);
  }

  /** Builds and publishes the room state now (lock-protected, skipped if unchanged). */
  async publishNow(roomId: string): Promise<boolean> {
    if (!this.builder) return false;
    const client = this.redis.getClient();
    const lockKey = `room_state:lock:${roomId}`;
    const token = `${process.pid}:${Date.now()}:${Math.random()}`;
    const locked = await client.set(lockKey, token, 'PX', LOCK_MS, 'NX').catch(() => 'OK');
    if (!locked) {
      // Another container is publishing this room; try again right after it.
      this.changed(roomId, 400);
      return false;
    }
    try {
      const state = await this.builder(roomId);
      const hashKey = `room_state:hash:${roomId}`;
      const seatsKey = `room_state:seats:${roomId}`;
      if (!state) {
        const version = await this.bumpVersion(roomId);
        await this.realtime.setRoomLiveState(roomId, {
          schema: LIVE_STATE_SCHEMA,
          version,
          room_id: roomId,
          ended: true,
          seats: [],
          online_count: 0,
        });
        await client.del(hashKey, seatsKey).catch(() => 0);
        return true;
      }
      const hash = stateHash(state);
      const prevHash = await client.get(hashKey).catch(() => null);
      if (prevHash === hash) return false;

      const version = await this.bumpVersion(roomId);
      this.lastPublishAt.set(roomId, Date.now());
      const ok = await this.realtime.setRoomLiveState(roomId, {
        schema: LIVE_STATE_SCHEMA,
        version,
        ...state,
      });

      // Released app versions: per-seat updates in the format they already understand.
      const prevSeatsRaw = await client.get(seatsKey).catch(() => null);
      const prevSeats = prevSeatsRaw ? (JSON.parse(prevSeatsRaw) as LiveSeat[]) : null;
      const legacy = changedSeats(prevSeats, state.seats).map((s) => legacySeatEvent(s, version));
      if (legacy.length) await this.realtime.publishRoomEvents(roomId, legacy);

      if (ok) {
        await client
          .multi()
          .set(hashKey, hash, 'EX', CACHE_TTL_S)
          .set(seatsKey, JSON.stringify(state.seats), 'EX', CACHE_TTL_S)
          .exec()
          .catch(() => null);
      }
      return ok;
    } finally {
      // Release only our own lock.
      const current = await client.get(lockKey).catch(() => null);
      if (current === token) await client.del(lockKey).catch(() => 0);
    }
  }

  private async bumpVersion(roomId: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ state_version: bigint }>>`
      UPDATE rooms
      SET state_version = GREATEST(
        state_version + 1,
        (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint
      )
      WHERE id = ${roomId}::uuid
      RETURNING state_version`;
    return Number(rows[0]?.state_version ?? 0n);
  }

  /**
   * Safety net: re-check live rooms with members every minute. Identical states are skipped
   * by the hash, so this only writes when some code path forgot to call [changed].
   */
  @Interval(60_000)
  async sweep(): Promise<void> {
    const client = this.redis.getClient();
    const gate = await client.set('room_state:sweep', '1', 'EX', 55, 'NX').catch(() => 'OK');
    if (!gate) return; // another container ran it this minute
    const stale = Date.now() - 10 * 60_000;
    for (const [id, at] of this.lastPublishAt) if (at < stale) this.lastPublishAt.delete(id);
    try {
      const rooms = await this.prisma.room.findMany({
        where: { isLive: true, members: { some: { isActive: true } } },
        select: { id: true },
        orderBy: { lastActivityAt: 'desc' },
        take: SWEEP_BATCH,
      });
      for (const r of rooms) {
        await this.publishNow(r.id).catch((e) =>
          this.logger.warn(`sweep publish(${r.id}) failed: ${String(e)}`),
        );
      }
    } catch (e) {
      this.logger.warn(`room state sweep failed: ${String(e)}`);
    }
  }
}

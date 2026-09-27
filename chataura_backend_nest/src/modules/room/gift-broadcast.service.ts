import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { RoomEvents } from './room.events';

export type GiftVisualTier = 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA';

export interface GiftDisplayEvent {
  giftId: number;
  senderId: number;
  senderName?: string;
  receiverId: number;
  receiverName?: string;
  tier: GiftVisualTier;
  count: number;
  costCoins: number;
  /** Epoch ms at first gift in the batch — used by client TTL check. */
  createdAt: number;
  image_url?: string | null;
  animation_url?: string | null;
  media_type?: string | null;
  loop?: boolean;
}

interface BurstBuffer {
  /** Aggregated count so far in this burst window. */
  count: number;
  /** Data from the first gift in the burst — metadata is stable within a burst. */
  seed: GiftDisplayEvent;
  /** Handle from setTimeout so we can clear/reset the window. */
  timer: ReturnType<typeof setTimeout>;
}

/**
 * In-memory gift display event aggregator.
 *
 * After each individual gift transaction commits, callers call `enqueue()`.
 * Events with the same (roomId + senderId + giftId) within a 250 ms window
 * are coalesced into a single display broadcast. The transaction itself is
 * never touched — this only controls what gets emitted over WebSocket for
 * animation/display purposes.
 *
 * This is intentionally in-memory: the deployment runs a single NestJS
 * instance. If horizontal scaling is introduced, migrate the buffer to
 * Redis LPUSH/LRANGE with a 250 ms TTL key per (room+sender+gift).
 */
@Injectable()
export class GiftBroadcastService implements OnModuleDestroy {
  /**
   * Key: `${roomId}:${senderId}:${giftId}`
   * Value: active burst buffer for this (room, sender, gift) combination.
   */
  private readonly buffers = new Map<string, BurstBuffer>();

  constructor(private readonly events: RoomEvents) {}

  /**
   * Enqueue one gift display unit. Called after the ledger transaction commits.
   * Never blocks or delays the calling transaction.
   */
  enqueue(roomId: string, event: GiftDisplayEvent): void {
    const key = `${roomId}:${event.senderId}:${event.giftId}`;
    const existing = this.buffers.get(key);

    if (existing) {
      // Accumulate into the existing burst window
      existing.count += event.count;
      clearTimeout(existing.timer);
      existing.timer = setTimeout(() => this.flush(roomId, key), 250);
    } else {
      // Start a new burst window
      const buffer: BurstBuffer = {
        count: event.count,
        seed: { ...event },
        timer: setTimeout(() => this.flush(roomId, key), 250),
      };
      this.buffers.set(key, buffer);
    }
  }

  private flush(roomId: string, key: string): void {
    const buffer = this.buffers.get(key);
    if (!buffer) return;
    this.buffers.delete(key);

    const payload = {
      ...buffer.seed,
      quantity: buffer.count,
    };

    // Emit the single aggregated display event to all room subscribers
    this.events.emitGiftOverlay(roomId, {
      gift_id: payload.giftId,
      image_url: payload.image_url ?? null,
      animation_url: payload.animation_url ?? null,
      media_type: payload.media_type ?? null,
      loop: payload.loop ?? false,
      sender_id: payload.senderId,
      sender_name: payload.senderName ?? '',
      receiver_id: payload.receiverId,
      tier: payload.tier,
      quantity: payload.quantity,
      cost_coins: payload.costCoins,
      created_at: payload.createdAt,
    });
  }

  onModuleDestroy(): void {
    // Cancel all pending timers on graceful shutdown
    for (const buffer of this.buffers.values()) {
      clearTimeout(buffer.timer);
    }
    this.buffers.clear();
  }
}

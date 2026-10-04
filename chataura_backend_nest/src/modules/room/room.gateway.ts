import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { TokenService } from '../auth/token.service';
import { RoomEvents } from './room.events';
import { RoomGiftingService } from './room-gifting.service';
import { wsThrottler, wsEventThrottler } from '../../common/utils/ws-throttler';

@WebSocketGateway({ namespace: '/ws/rooms', cors: { origin: true } })
export class RoomGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly tokens: TokenService,
    private readonly events: RoomEvents,
    private readonly gifting: RoomGiftingService,
  ) {
    this.events.emitSeatUpdated = (roomId, payload) => {
      this.server?.to(`room:${roomId}`).emit('room:seat_updated', payload);
    };
    this.events.emitGiftOverlay = (roomId, payload) => {
      this.server?.to(`room:${roomId}`).emit('room:gift_overlay', payload);
    };
    this.events.emitRocketLaunch = (roomId, payload) => {
      this.server?.to(`room:${roomId}`).emit('room:rocket_launch', payload);
    };
  }

  handleConnection(client: Socket) {
    if (wsThrottler.isRateLimited(client)) {
      client.emit('error', 'Too many connection attempts. Please wait.');
      client.disconnect(true);
      return;
    }
    const token =
      (client.handshake.auth?.token as string) ||
      (client.handshake.query?.token as string) ||
      String(client.handshake.headers.authorization ?? '').replace(
        /^Bearer\s+/i,
        '',
      );
    const payload = this.tokens.verifyAccessToken(token);
    if (!payload?.sub) {
      client.disconnect();
      return;
    }
    client.data.userId = payload.sub;
  }

  @SubscribeMessage('room:join')
  joinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { room_id: string },
  ) {
    if (body?.room_id) void client.join(`room:${body.room_id}`);
    return { ok: true };
  }

  /**
   * Per-websocket-event rate limited gift sending (Requirement 7b).
   * Limits rapid gift spam over WebSocket to max 5 requests per second per socket.
   */
  @SubscribeMessage('gift.send')
  async handleGiftSend(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: {
      room_id: string;
      gift_id: number | string;
      receiver_id: number | string;
      quantity?: number;
      idempotency_key?: string;
      gift_name?: string;
      gift_key?: string;
      gift_category?: string;
      expected_coin_cost?: number | string;
    },
  ) {
    if (wsEventThrottler.isEventRateLimited(client.id, 'gift.send', 5, 1000)) {
      return {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many gift requests. Max 5 per second.',
        },
      };
    }
    const userId = client.data?.userId;
    if (!userId) {
      return {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      };
    }
    try {
      return await this.gifting.sendRoomGift(BigInt(userId), body.room_id, body);
    } catch (e: any) {
      return {
        success: false,
        error: {
          code: e?.response?.error?.code ?? 'GIFT_SEND_FAILED',
          message:
            e?.response?.error?.message ?? e?.message ?? 'Failed to send gift',
          ...(e?.response?.error?.details
            ? { details: e.response.error.details }
            : {}),
        },
      };
    }
  }

  @SubscribeMessage('gift:send')
  async handleGiftSendAlias(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: {
      room_id: string;
      gift_id: number | string;
      receiver_id: number | string;
      quantity?: number;
      idempotency_key?: string;
      gift_name?: string;
      gift_key?: string;
      gift_category?: string;
      expected_coin_cost?: number | string;
    },
  ) {
    return this.handleGiftSend(client, body);
  }
}

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
import { wsThrottler } from '../../common/utils/ws-throttler';

@WebSocketGateway({ namespace: '/ws/rooms', cors: { origin: true } })
export class RoomGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly tokens: TokenService,
    private readonly events: RoomEvents,
  ) {
    this.events.emitSeatUpdated = (roomId, payload) => {
      this.server?.to(`room:${roomId}`).emit('room:seat_updated', payload);
    };
    this.events.emitGiftOverlay = (roomId, payload) => {
      this.server?.to(`room:${roomId}`).emit('room:gift_overlay', payload);
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
}

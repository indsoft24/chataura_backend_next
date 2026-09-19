import {
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { TokenService } from '../auth/token.service';
import { ChatEvents } from './chat.events';
import { wsThrottler } from '../../common/utils/ws-throttler';

@WebSocketGateway({ namespace: '/ws/chat', cors: { origin: true } })
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly tokens: TokenService,
    private readonly events: ChatEvents,
  ) {
    this.events.emitReceive = (userId, payload) => {
      this.server?.to(`user:${userId}`).emit('message:receive', payload);
    };
    this.events.emitRead = (userId, payload) => {
      this.server?.to(`user:${userId}`).emit('message:read', payload);
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
    void client.join(`user:${payload.sub}`);
  }

  @SubscribeMessage('message:join')
  join() {
    return { ok: true };
  }
}

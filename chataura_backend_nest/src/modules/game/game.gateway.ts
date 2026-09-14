import {
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { TokenService } from '../auth/token.service';
import { GameEvents } from './game.events';

@WebSocketGateway({ namespace: '/ws/games', cors: { origin: true } })
export class GameGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly tokens: TokenService,
    private readonly events: GameEvents,
  ) {
    this.events.emitTick = (game, payload) => {
      this.server?.to(`game:${game}`).emit('game:tick', payload);
    };
    this.events.emitResult = (game, payload) => {
      this.server?.to(`game:${game}`).emit('game:result', payload);
    };
  }

  handleConnection(client: Socket) {
    const token =
      (client.handshake.auth?.token as string) ||
      (client.handshake.query?.token as string) ||
      String(client.handshake.headers.authorization ?? '').replace(
        /^Bearer\s+/i,
        '',
      );
    if (!this.tokens.verifyAccessToken(token)?.sub) {
      client.disconnect();
    }
  }

  @SubscribeMessage('game:subscribe')
  subscribe(client: Socket, body: { game: string }) {
    if (body?.game) void client.join(`game:${body.game}`);
    return { ok: true };
  }
}

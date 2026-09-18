import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { GameService } from './game.service';

@Injectable()
export class GameEngine implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GameEngine.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly games: GameService) {}

  onModuleInit() {
    void this.games.tick().catch((e) => this.logger.warn(String(e)));
    this.timer = setInterval(() => {
      void this.games
        .tick()
        .catch((e) => this.logger.warn(`tick: ${String(e)}`));
    }, 1000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}

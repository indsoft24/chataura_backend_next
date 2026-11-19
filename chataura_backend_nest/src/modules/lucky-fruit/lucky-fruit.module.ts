import { Module, OnModuleDestroy, OnModuleInit, Logger, Injectable } from '@nestjs/common';
import { GameModule } from '../game/game.module';
import { GameHistoryModule } from '../game-history/game-history.module';
import { WalletModule } from '../wallet/wallet.module';
import { LuckyFruitAdminController, LuckyFruitController } from './lucky-fruit.controller';
import { LuckyFruitService } from './lucky-fruit.service';

/** Settles due rounds every second (the same way the other games' engine does). */
@Injectable()
export class LuckyFruitEngine implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LuckyFruitEngine.name);
  private timer?: NodeJS.Timeout;
  constructor(private readonly lf: LuckyFruitService) {}
  onModuleInit() {
    this.timer = setInterval(() => void this.lf.tick().catch((e) => this.logger.warn(`tick: ${String(e)}`)), 1000);
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}

@Module({
  imports: [WalletModule, GameHistoryModule, GameModule],
  controllers: [LuckyFruitController, LuckyFruitAdminController],
  providers: [LuckyFruitService, LuckyFruitEngine],
})
export class LuckyFruitModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WalletModule } from '../wallet/wallet.module';
import { GameController } from './game.controller';
import { GameEngine } from './game.engine';
import { GameEvents } from './game.events';
import { GameGateway } from './game.gateway';
import { GameService } from './game.service';

@Module({
  imports: [WalletModule, AuthModule],
  controllers: [GameController],
  providers: [GameService, GameEngine, GameEvents, GameGateway],
  exports: [GameService],
})
export class GameModule {}

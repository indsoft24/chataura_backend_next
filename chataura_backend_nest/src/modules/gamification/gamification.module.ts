import { Module } from '@nestjs/common';
import { GameHistoryModule } from '../game-history/game-history.module';
import { WalletModule } from '../wallet/wallet.module';
import { BonusSpinService } from './bonus-spin.service';
import { GamificationController } from './gamification.controller';
import { GamificationService } from './gamification.service';

@Module({
  imports: [WalletModule, GameHistoryModule],
  controllers: [GamificationController],
  providers: [GamificationService, BonusSpinService],
  exports: [GamificationService, BonusSpinService],
})
export class GamificationModule {}

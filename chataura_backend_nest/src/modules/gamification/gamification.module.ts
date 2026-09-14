import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { BonusSpinService } from './bonus-spin.service';
import { GamificationController } from './gamification.controller';
import { GamificationService } from './gamification.service';

@Module({
  imports: [WalletModule],
  controllers: [GamificationController],
  providers: [GamificationService, BonusSpinService],
  exports: [GamificationService, BonusSpinService],
})
export class GamificationModule {}

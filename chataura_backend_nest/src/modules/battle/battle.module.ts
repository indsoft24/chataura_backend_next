import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { BattleAdminController, BattleController } from './battle.controller';
import { BattleService } from './battle.service';

@Module({
  imports: [WalletModule],
  controllers: [BattleController, BattleAdminController],
  providers: [BattleService],
  exports: [BattleService],
})
export class BattleModule {}

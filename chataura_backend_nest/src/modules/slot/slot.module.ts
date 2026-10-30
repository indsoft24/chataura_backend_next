import { Module } from '@nestjs/common';
import { GameHistoryModule } from '../game-history/game-history.module';
import { WalletModule } from '../wallet/wallet.module';
import { SlotAdminController, SlotController } from './slot.controller';
import { SlotService } from './slot.service';

@Module({
  imports: [WalletModule, GameHistoryModule],
  controllers: [SlotController, SlotAdminController],
  providers: [SlotService],
})
export class SlotModule {}

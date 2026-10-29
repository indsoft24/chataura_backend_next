import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { SlotAdminController, SlotController } from './slot.controller';
import { SlotService } from './slot.service';

@Module({
  imports: [WalletModule],
  controllers: [SlotController, SlotAdminController],
  providers: [SlotService],
})
export class SlotModule {}

import { Module } from '@nestjs/common';
import { SvipModule } from '../svip/svip.module';
import { WalletModule } from '../wallet/wallet.module';
import { GoldMineAdminService } from './gold-mine-admin.service';
import {
  GoldMineAdminController,
  GoldMineController,
} from './gold-mine.controller';
import { GoldMineService } from './gold-mine.service';

@Module({
  imports: [SvipModule, WalletModule],
  controllers: [GoldMineController, GoldMineAdminController],
  providers: [GoldMineService, GoldMineAdminService],
})
export class GoldMineModule {}

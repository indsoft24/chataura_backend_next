import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { WalletModule } from '../wallet/wallet.module';
import { RoomModule } from '../room/room.module';
import { FxAssetsModule } from '../fx-assets/fx-assets.module';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminController } from './admin.controller';
import { AdminRechargeService } from './admin-recharge.service';
import { AdminService } from './admin.service';

@Module({
  imports: [MediaModule, WalletModule, RoomModule, FxAssetsModule],
  controllers: [AdminController],
  providers: [AdminService, AdminCatalogService, AdminRechargeService],
  exports: [AdminService, AdminCatalogService],
})
export class AdminModule {}

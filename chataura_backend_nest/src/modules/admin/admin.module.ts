import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { WalletModule } from '../wallet/wallet.module';
import { RoomModule } from '../room/room.module';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [MediaModule, WalletModule, RoomModule],
  controllers: [AdminController],
  providers: [AdminService, AdminCatalogService],
  exports: [AdminService, AdminCatalogService],
})
export class AdminModule {}

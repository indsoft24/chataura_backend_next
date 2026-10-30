import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { WalletModule } from '../wallet/wallet.module';
import { SvipAdminService } from './svip-admin.service';
import {
  SvipAdminController,
  SvipController,
  SvipPrivilegesController,
  SvipSellerController,
} from './svip.controller';
import { SvipPrivilegesService } from './svip-privileges.service';
import { SvipSellerService } from './svip-seller.service';
import { SvipService } from './svip.service';

@Module({
  imports: [WalletModule, MediaModule],
  controllers: [SvipController, SvipAdminController, SvipPrivilegesController, SvipSellerController],
  providers: [SvipService, SvipAdminService, SvipPrivilegesService, SvipSellerService],
  exports: [SvipService],
})
export class SvipModule {}

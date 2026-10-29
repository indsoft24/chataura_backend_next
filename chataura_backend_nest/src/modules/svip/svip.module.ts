import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { WalletModule } from '../wallet/wallet.module';
import { SvipAdminService } from './svip-admin.service';
import {
  SvipAdminController,
  SvipController,
  SvipPrivilegesController,
} from './svip.controller';
import { SvipPrivilegesService } from './svip-privileges.service';
import { SvipService } from './svip.service';

@Module({
  imports: [WalletModule, MediaModule],
  controllers: [SvipController, SvipAdminController, SvipPrivilegesController],
  providers: [SvipService, SvipAdminService, SvipPrivilegesService],
  exports: [SvipService],
})
export class SvipModule {}

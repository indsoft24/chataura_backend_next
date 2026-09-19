import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [MediaModule],
  controllers: [AdminController],
  providers: [AdminService, AdminCatalogService],
  exports: [AdminService, AdminCatalogService],
})
export class AdminModule {}

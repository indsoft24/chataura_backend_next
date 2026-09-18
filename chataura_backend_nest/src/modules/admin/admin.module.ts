import { Module } from '@nestjs/common';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  controllers: [AdminController],
  providers: [AdminService, AdminCatalogService],
  exports: [AdminService, AdminCatalogService],
})
export class AdminModule {}

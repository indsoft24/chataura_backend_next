import { Module } from '@nestjs/common';
import { MusicalChairAdminController, MusicalChairController } from './musical-chair.controller';
import { MusicalChairService } from './musical-chair.service';

@Module({
  controllers: [MusicalChairController, MusicalChairAdminController],
  providers: [MusicalChairService],
  exports: [MusicalChairService],
})
export class MusicalChairModule {}

import { Module } from '@nestjs/common';
import { MedalController } from './medal.controller';
import { MedalService } from './medal.service';

@Module({
  controllers: [MedalController],
  providers: [MedalService],
})
export class MedalModule {}

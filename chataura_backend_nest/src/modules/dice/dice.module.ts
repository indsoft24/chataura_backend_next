import { Module } from '@nestjs/common';
import { SvipModule } from '../svip/svip.module';
import { DiceController } from './dice.controller';
import { DiceService } from './dice.service';

@Module({
  imports: [SvipModule],
  controllers: [DiceController],
  providers: [DiceService],
})
export class DiceModule {}

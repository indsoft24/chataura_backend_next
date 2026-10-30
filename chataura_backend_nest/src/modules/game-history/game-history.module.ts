import { Module } from '@nestjs/common';
import { GameHistoryAdminController, GameHistoryController } from './game-history.controller';
import { GameHistoryService } from './game-history.service';

@Module({
  controllers: [GameHistoryController, GameHistoryAdminController],
  providers: [GameHistoryService],
  exports: [GameHistoryService],
})
export class GameHistoryModule {}

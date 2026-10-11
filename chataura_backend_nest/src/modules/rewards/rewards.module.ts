import { Module } from '@nestjs/common';
import { RewardHistoryController } from './reward-history.controller';
import { RewardHistoryService } from './reward-history.service';

@Module({
  controllers: [RewardHistoryController],
  providers: [RewardHistoryService],
})
export class RewardsModule {}

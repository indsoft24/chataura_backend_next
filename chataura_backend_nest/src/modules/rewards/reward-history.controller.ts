import { Controller, Get, Query } from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { isRewardCategory, parseTzOffset } from './reward-history.rules';
import { RewardHistoryService } from './reward-history.service';

@Controller()
export class RewardHistoryController {
  constructor(private readonly rewards: RewardHistoryService) {}

  /** The signed-in user's rewards, newest first (cursor paged; summary on the first page). */
  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @Get('users/me/rewards')
  history(
    @CurrentUser() user: AuthUser,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('category') category?: string,
    @Query('tz_offset') tzOffset?: string,
    @Query('fresh') fresh?: string,
  ) {
    return this.rewards.history(user.id, {
      cursor,
      limit: limit ? Number(limit) : undefined,
      category: isRewardCategory(category) ? category : null,
      tzOffsetMinutes: parseTzOffset(tzOffset),
      fresh: fresh === '1' || fresh === 'true',
    });
  }
}

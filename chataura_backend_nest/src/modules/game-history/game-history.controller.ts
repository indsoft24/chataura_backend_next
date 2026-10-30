import { Controller, Get, Query } from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { GameHistoryService } from './game-history.service';

@Controller('game/history')
export class GameHistoryController {
  constructor(private readonly history: GameHistoryService) {}

  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() q: { game?: string; result?: string; cursor?: string; limit?: string },
  ) {
    return this.history.list(user.id, q);
  }

  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @Get('summary')
  summary(@CurrentUser() user: AuthUser, @Query('game') game?: string) {
    return this.history.summary(user.id, game);
  }
}

@Roles('admin')
@Controller('admin/game-history')
export class GameHistoryAdminController {
  constructor(private readonly history: GameHistoryService) {}

  @Get()
  list(@Query() q: Record<string, string>) {
    return this.history.adminList(q);
  }
}

import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RankingsService } from './rankings.service';

@Controller('rankings')
export class RankingsController {
  constructor(private readonly rankings: RankingsService) {}

  /** Users by coins spent (`type=giver`, default) or gift value received (`type=receiver`). */
  @Get('personal')
  personal(
    @CurrentUser() user: { id: bigint },
    @Query('period') period?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
  ) {
    return this.rankings.personalSpend(period, limit, user.id, type);
  }

  /** Public rooms by coins spent in-room (excludes private). */
  @Get('rooms')
  rooms(
    @CurrentUser() user: { id: bigint },
    @Query('period') period?: string,
    @Query('limit') limit?: string,
  ) {
    return this.rankings.roomSpend(period, limit, user.id);
  }
}

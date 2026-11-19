import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { MinTier } from '../../common/decorators/min-tier.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { LuckyFruitService } from './lucky-fruit.service';

@Controller('games/lucky-fruit')
export class LuckyFruitController {
  constructor(private readonly lf: LuckyFruitService) {}

  @Throttle({ default: { limit: 120, ttl: seconds(60) } })
  @Get()
  state(@CurrentUser() user: AuthUser) {
    return this.lf.state(user.id);
  }

  @Throttle({ default: { limit: 120, ttl: seconds(60) } })
  @Get('result')
  result(@CurrentUser() user: AuthUser, @Query('round_id') roundId?: string) {
    return this.lf.result(user.id, BigInt(/^\d{1,18}$/.test(roundId ?? '') ? (roundId as string) : '0'));
  }

  @Throttle({ default: { limit: 240, ttl: seconds(60) } })
  @Post('bet')
  bet(@CurrentUser() user: AuthUser, @Body() body: { item?: unknown; amount?: unknown; request_id?: unknown }) {
    return this.lf.bet(user.id, body?.item, body?.amount, body?.request_id);
  }

  @Post('chest/claim')
  claim(@CurrentUser() user: AuthUser, @Body() body: { tier?: unknown }) {
    return this.lf.claimChest(user.id, body?.tier);
  }
}

@Roles('admin')
@Controller('admin/lucky-fruit')
export class LuckyFruitAdminController {
  constructor(private readonly lf: LuckyFruitService) {}

  @MinTier('superadmin')
  @Get()
  get() {
    return this.lf.adminView();
  }

  @MinTier('superadmin')
  @Get('stats')
  stats() {
    return this.lf.adminStats();
  }

  @MinTier('superadmin')
  @Put()
  set(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.lf.updateSettings(body ?? {}, user.id);
  }
}

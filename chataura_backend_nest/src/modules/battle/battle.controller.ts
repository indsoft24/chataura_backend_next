import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { MinTier } from '../../common/decorators/min-tier.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { battleSettingsForApi } from './battle.rules';
import { BattleService } from './battle.service';

@Controller('rooms/:id/battle')
export class BattleController {
  constructor(private readonly battle: BattleService) {}

  @Get()
  state(@Param('id') id: string) {
    return this.battle.state(id);
  }

  @Throttle({ default: { limit: 20, ttl: seconds(60) } })
  @Post()
  start(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body('minutes') minutes: unknown) {
    return this.battle.start(user.id, id, minutes);
  }

  @Throttle({ default: { limit: 20, ttl: seconds(60) } })
  @Post('cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.battle.cancel(user.id, id);
  }
}

@Roles('admin')
@Controller('admin/battle')
export class BattleAdminController {
  constructor(private readonly battle: BattleService) {}

  @MinTier('superadmin')
  @Get()
  async get() {
    return battleSettingsForApi(await this.battle.settings());
  }

  @MinTier('superadmin')
  @Put()
  set(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.battle.updateSettings(body ?? {}, user.id);
  }
}

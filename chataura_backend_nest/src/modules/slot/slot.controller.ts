import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { MinTier } from '../../common/decorators/min-tier.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { slotSettingsForApi } from './slot.rules';
import { SlotService } from './slot.service';

@Controller('games/slot')
export class SlotController {
  constructor(private readonly slot: SlotService) {}

  @Get()
  state(@CurrentUser() user: AuthUser) {
    return this.slot.state(user.id);
  }

  @Get('history')
  history(@CurrentUser() user: AuthUser) {
    return this.slot.history(user.id);
  }

  @Throttle({ default: { limit: 90, ttl: seconds(60) } })
  @Post('spin')
  spin(@CurrentUser() user: AuthUser, @Body() body: { bet?: unknown; request_id?: unknown }) {
    return this.slot.spin(user.id, body?.bet, body?.request_id);
  }
}

@Roles('admin')
@Controller('admin/slot')
export class SlotAdminController {
  constructor(private readonly slot: SlotService) {}

  @MinTier('superadmin')
  @Get()
  async get() {
    return slotSettingsForApi(await this.slot.settings());
  }

  @MinTier('superadmin')
  @Put()
  set(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.slot.updateSettings(body ?? {}, user.id);
  }
}

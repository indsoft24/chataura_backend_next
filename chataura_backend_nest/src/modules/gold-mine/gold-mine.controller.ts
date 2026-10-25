import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { MinTier } from '../../common/decorators/min-tier.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { GoldMineAdminService } from './gold-mine-admin.service';
import { GoldMineService } from './gold-mine.service';

function parseId(id: string): bigint {
  if (!/^\d{1,18}$/.test(id)) throw new BadRequestException('Invalid id');
  return BigInt(id);
}

@Controller('gold-mine')
export class GoldMineController {
  constructor(private readonly mine: GoldMineService) {}

  @Get()
  state(@CurrentUser() user: AuthUser) {
    return this.mine.state(user.id);
  }

  @Post('activate')
  activate(
    @CurrentUser() user: AuthUser,
    @Body() body: { plan_id?: number | string },
  ) {
    return this.mine.activate(user.id, Number(body?.plan_id));
  }

  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @Post('draw')
  draw(@CurrentUser() user: AuthUser) {
    return this.mine.draw(user.id);
  }

  @Get('draws')
  draws(@CurrentUser() user: AuthUser, @Query('cursor') cursor?: string) {
    return this.mine.draws(user.id, cursor);
  }
}

@Roles('admin')
@Controller('admin/gold-mine')
export class GoldMineAdminController {
  constructor(private readonly admin: GoldMineAdminService) {}

  @MinTier('superadmin')
  @Get()
  get() {
    return this.admin.get();
  }

  @MinTier('superadmin')
  @Put()
  update(
    @CurrentUser() user: AuthUser,
    @Body() body: { settings?: Record<string, unknown>; plans?: [] },
  ) {
    return this.admin.update(body, user.id);
  }

  @MinTier('superadmin')
  @Post('prizes')
  createPrize(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.admin.createPrize(body, user.id);
  }

  @MinTier('superadmin')
  @Put('prizes/:id')
  updatePrize(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.admin.updatePrize(parseId(id), body, user.id);
  }

  @MinTier('superadmin')
  @Delete('prizes/:id')
  deletePrize(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.deletePrize(parseId(id), user.id);
  }
}

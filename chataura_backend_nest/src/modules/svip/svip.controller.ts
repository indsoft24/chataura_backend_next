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
  Req,
} from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { MinTier } from '../../common/decorators/min-tier.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SvipAdminService } from './svip-admin.service';
import { SvipPrivilegesService } from './svip-privileges.service';
import { SvipSellerService } from './svip-seller.service';
import { SvipService } from './svip.service';

function parseId(id: string): bigint {
  if (!/^\d{1,18}$/.test(id)) throw new BadRequestException('Invalid id');
  return BigInt(id);
}

@Controller('svip')
export class SvipController {
  constructor(private readonly svip: SvipService) {}

  @Get('center')
  center(@CurrentUser() user: AuthUser) {
    return this.svip.center(user.id);
  }

  @Post('renew')
  renew(@CurrentUser() user: AuthUser) {
    return this.svip.renew(user.id);
  }

  @Post('claim-monthly')
  claimMonthly(@CurrentUser() user: AuthUser) {
    return this.svip.claimMonthly(user.id);
  }

  @Get('items')
  items(@CurrentUser() user: AuthUser) {
    return this.svip.items(user.id);
  }

  @Put('items')
  updateItems(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      bubble?: boolean;
      room_card?: boolean;
      mic_wave?: boolean;
      frame?: boolean;
      entry_bar?: boolean;
      entry_bar_id?: number | string;
    },
  ) {
    return this.svip.updateItems(user.id, body);
  }

  @Get('records')
  records(@CurrentUser() user: AuthUser, @Query('cursor') cursor?: string) {
    return this.svip.records(user.id, cursor);
  }
}

/** Coin seller panel: give SVIP from the seller's own balance. Role is checked inside the service. */
@Controller('svip/seller')
export class SvipSellerController {
  constructor(private readonly seller: SvipSellerService) {}

  @Get('panel')
  panel(@CurrentUser() user: AuthUser) {
    return this.seller.panel(user.id);
  }

  @Get('lookup')
  lookup(@CurrentUser() user: AuthUser, @Query('user') ref?: string) {
    return this.seller.lookup(user.id, String(ref ?? ''));
  }

  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @Post('gift')
  gift(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      user?: string;
      level?: number | string;
      with_recharge?: boolean;
      recharge_coins?: number | string;
      request_id?: string;
    },
  ) {
    return this.seller.gift(user.id, body ?? {});
  }

  @Get('history')
  history(@CurrentUser() user: AuthUser, @Query('cursor') cursor?: string) {
    return this.seller.history(user.id, cursor);
  }
}

@Roles('admin')
@Controller('admin/svip')
export class SvipAdminController {
  constructor(
    private readonly svip: SvipService,
    private readonly admin: SvipAdminService,
  ) {}

  @MinTier('superadmin')
  @Get('config')
  config() {
    return this.admin.getConfig();
  }

  @MinTier('superadmin')
  @Put('config')
  updateConfig(
    @CurrentUser() user: AuthUser,
    @Body() body: { settings?: Record<string, unknown>; levels?: [] },
  ) {
    return this.admin.updateConfig(body, user.id);
  }

  @MinTier('superadmin')
  @Get('sellers')
  sellers(@Query() q: { page?: string; limit?: string; q?: string }) {
    return this.admin.sellers(q);
  }

  @MinTier('superadmin')
  @Get('gifts')
  gifts(@Query() q: { page?: string; limit?: string; giver?: string }) {
    return this.admin.gifts(q);
  }

  @MinTier('superadmin')
  @Get('members')
  members(@Query() q: { status?: string; page?: string; limit?: string }) {
    return this.svip.adminMembers(q);
  }

  /** `user` = public display ID or account id. */
  @MinTier('superadmin')
  @Post('members/grant')
  grant(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      user?: string;
      level?: number | string;
      days?: number | string;
      recharge_coins?: number | string;
    },
  ) {
    const rc = String(body?.recharge_coins ?? '0').trim() || '0';
    if (!/^\d{1,10}$/.test(rc)) throw new BadRequestException('recharge_coins must be a whole number');
    return this.svip.adminGrant(
      String(body?.user ?? ''),
      Number(body?.level),
      Number(body?.days),
      user.id,
      BigInt(rc),
    );
  }

  @MinTier('superadmin')
  @Post('members/:userId/revoke')
  revoke(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    return this.svip.adminRevoke(parseId(userId), user.id);
  }
}

/** SVIP functional privileges with their own endpoints. */
@Controller()
export class SvipPrivilegesController {
  constructor(private readonly privileges: SvipPrivilegesService) {}

  /** Multipart `file`. Post the returned URL into room chat. */
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @Post('rooms/:id/images')
  roomImage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: FastifyRequest,
  ) {
    return this.privileges.uploadRoomImage(user.id, id, req);
  }

  @Get('users/me/visitors')
  visitors(@CurrentUser() user: AuthUser, @Query('cursor') cursor?: string) {
    return this.privileges.visitors(user.id, cursor);
  }

  @Put('svip/profile-background')
  setBackground(
    @CurrentUser() user: AuthUser,
    @Body() body: { url?: string | null },
  ) {
    return this.privileges.setProfileBackground(user.id, body?.url ?? null);
  }

  @Delete('svip/profile-background')
  clearBackground(@CurrentUser() user: AuthUser) {
    return this.privileges.setProfileBackground(user.id, null);
  }
}

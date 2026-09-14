import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { AgencyService } from './agency.service';

@Controller()
export class AgencyController {
  constructor(private readonly agency: AgencyService) {}

  @Get('agency/me')
  me(@CurrentUser() user: AuthUser) {
    return this.agency.me(user.id);
  }

  @Post('agency/join')
  join(
    @CurrentUser() user: AuthUser,
    @Body() body: { agency_user_id: number | string; room_id?: string },
  ) {
    return this.agency.join(user.id, body);
  }

  @Post('agency/leave')
  leave(@CurrentUser() user: AuthUser) {
    return this.agency.leave(user.id);
  }

  @Get('agency/requests')
  requests(@CurrentUser() user: AuthUser) {
    return this.agency.requests(user.id);
  }

  @Post('agency/requests/:id/accept')
  accept(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body?: { room_id?: string },
  ) {
    return this.agency.accept(user.id, BigInt(id), body);
  }

  @Post('agency/requests/:id/reject')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.agency.reject(user.id, BigInt(id));
  }

  @Get('agency/members')
  members(@CurrentUser() user: AuthUser) {
    return this.agency.members(user.id);
  }

  @Get('agency/members/:ownerId')
  memberDetail(
    @CurrentUser() user: AuthUser,
    @Param('ownerId') ownerId: string,
  ) {
    return this.agency.memberDetail(user.id, BigInt(ownerId));
  }

  @Get('agency/analytics')
  analytics(@CurrentUser() user: AuthUser) {
    return this.agency.analytics(user.id);
  }

  @Get('agency/weekly')
  weekly(
    @CurrentUser() user: AuthUser,
    @Query('period_id') periodId?: string,
  ) {
    return this.agency.weekly(
      user.id,
      periodId ? BigInt(periodId) : undefined,
    );
  }

  @Post('agency/weekly/:id/approve')
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { approved_gems: number; notes?: string },
  ) {
    return this.agency.weeklyApprove(user.id, BigInt(id), body);
  }

  @Post('agency/weekly/:id/reject')
  weeklyReject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body?: { notes?: string },
  ) {
    return this.agency.weeklyReject(user.id, BigInt(id), body);
  }
}

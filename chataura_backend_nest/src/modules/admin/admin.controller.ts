import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminService } from './admin.service';

@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('dashboard')
  dashboard() {
    return this.admin.dashboard();
  }

  @Get('users')
  users(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.admin.users(q, Number(page ?? 1), Number(limit ?? 20));
  }

  @Post('users/:id/suspend')
  suspend(
    @Param('id') id: string,
    @Body() body?: { reason?: string },
  ) {
    return this.admin.suspend(BigInt(id), body?.reason);
  }

  @Post('users/:id/unsuspend')
  unsuspend(@Param('id') id: string) {
    return this.admin.unsuspend(BigInt(id));
  }

  @Post('users/:id/star')
  star(
    @Param('id') id: string,
    @Body() body?: { is_star?: boolean },
  ) {
    return this.admin.setStar(BigInt(id), body?.is_star !== false);
  }

  @Post('users/:id/deactivate')
  deactivate(
    @Param('id') id: string,
    @Body() body?: { reason?: string },
  ) {
    return this.admin.deactivate(BigInt(id), body?.reason);
  }

  @Post('users/:id/link')
  link(
    @Param('id') id: string,
    @Body() body?: { role?: 'user' | 'seller' | 'admin'; email?: string },
  ) {
    return this.admin.linkExistingUser(BigInt(id), body ?? {});
  }

  @Get('staff')
  staff() {
    return this.admin.staff();
  }

  @Get('packages')
  packages() {
    return this.admin.packages();
  }

  @Post('packages')
  createPackage(
    @Body()
    body: {
      coins: number;
      price: number;
      currency?: string;
      audience?: string;
      original_price?: number;
    },
  ) {
    return this.admin.createPackage(body);
  }

  @Patch('packages/:id')
  updatePackage(
    @Param('id') id: string,
    @Body()
    body: {
      coins?: number;
      price?: number;
      is_active?: boolean;
      audience?: string;
    },
  ) {
    return this.admin.updatePackage(BigInt(id), body);
  }

  @Get('reports')
  reports(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.admin.reports(Number(page ?? 1), Number(limit ?? 20));
  }

  @Get('gifts')
  gifts() {
    return this.admin.gifts();
  }

  @Post('gifts')
  createGift(
    @Body() body: { name: string; coin_cost: number; image_url?: string },
  ) {
    return this.admin.createGift(body);
  }

  @Patch('gifts/:id')
  updateGift(
    @Param('id') id: string,
    @Body() body: { name?: string; coin_cost?: number; is_active?: boolean },
  ) {
    return this.admin.updateGift(BigInt(id), body);
  }

  @Get('banners')
  banners() {
    return this.admin.bannersAdmin();
  }

  @Post('banners')
  createBanner(@Body() body: Record<string, unknown>) {
    return this.admin.createBanner(body);
  }

  @Patch('banners/:id')
  updateBanner(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.admin.updateBanner(BigInt(id), body);
  }

  @Delete('banners/:id')
  deleteBanner(@Param('id') id: string) {
    return this.admin.deleteBanner(BigInt(id));
  }

  @Get('withdrawals')
  withdrawals() {
    return this.admin.withdrawals();
  }
}

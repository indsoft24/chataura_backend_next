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

  @Delete('packages/:id')
  deletePackage(@Param('id') id: string) {
    return this.admin.deletePackage(BigInt(id));
  }

  @Get('reports')
  reports(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.admin.reports(Number(page ?? 1), Number(limit ?? 20));
  }

  @Delete('reports/:id')
  deleteReport(@Param('id') id: string) {
    return this.admin.resolveReport(BigInt(id));
  }

  @Post('reports/:id/resolve')
  resolveReport(@Param('id') id: string) {
    return this.admin.resolveReport(BigInt(id));
  }

  @Get('gifts')
  gifts() {
    return this.admin.gifts();
  }

  @Post('gifts')
  createGift(
    @Body()
    body: {
      name: string;
      coin_cost?: number;
      coinCost?: number;
      image_url?: string;
      imageUrl?: string;
    },
  ) {
    return this.admin.createGift(body);
  }

  @Patch('gifts/:id')
  updateGift(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      coin_cost?: number;
      coinCost?: number;
      image_url?: string;
      imageUrl?: string;
      is_active?: boolean;
    },
  ) {
    return this.admin.updateGift(BigInt(id), body);
  }

  @Delete('gifts/:id')
  deleteGift(@Param('id') id: string) {
    return this.admin.deleteGift(BigInt(id));
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

  @Post('withdrawals/:id/approve')
  approveWithdrawal(@Param('id') id: string) {
    return this.admin.approveWithdrawal(BigInt(id));
  }

  @Post('withdrawals/:id/reject')
  rejectWithdrawal(
    @Param('id') id: string,
    @Body() body?: { reason?: string },
  ) {
    return this.admin.rejectWithdrawal(BigInt(id), body?.reason);
  }

  // Levels
  @Get('levels')
  levels() {
    return this.admin.levels();
  }

  @Post('levels')
  createLevel(
    @Body()
    body: {
      level: number;
      min_xp: number;
      max_xp: number;
      label?: string;
      badge_url?: string;
      icon_url?: string;
    },
  ) {
    return this.admin.createLevel(body);
  }

  @Patch('levels/:id')
  updateLevel(
    @Param('id') id: string,
    @Body()
    body: {
      min_xp?: number;
      max_xp?: number;
      label?: string;
      badge_url?: string;
      icon_url?: string;
    },
  ) {
    return this.admin.updateLevel(Number(id), body);
  }

  @Delete('levels/:id')
  deleteLevel(@Param('id') id: string) {
    return this.admin.deleteLevel(Number(id));
  }

  // Frames & Role Frames
  @Get('frames')
  frames(@Query('category') category?: string) {
    return this.admin.frames(category);
  }

  @Post('frames')
  createFrame(
    @Body()
    body: {
      name: string;
      category?: string;
      level_required?: number;
      coin_cost?: number;
      is_premium?: boolean;
      image_url?: string;
      animation_key?: string;
    },
  ) {
    return this.admin.createFrame(body);
  }

  @Patch('frames/:id')
  updateFrame(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      category?: string;
      level_required?: number;
      coin_cost?: number;
      is_premium?: boolean;
      is_active?: boolean;
      image_url?: string;
      animation_key?: string;
    },
  ) {
    return this.admin.updateFrame(BigInt(id), body);
  }

  @Delete('frames/:id')
  deleteFrame(@Param('id') id: string) {
    return this.admin.deleteFrame(BigInt(id));
  }

  // Entry Bars
  @Get('entry-bars')
  entryBars() {
    return this.admin.entryBars();
  }

  @Post('entry-bars')
  createEntryBar(
    @Body()
    body: {
      name: string;
      level_required?: number;
      image_url?: string;
    },
  ) {
    return this.admin.createEntryBar(body);
  }

  @Patch('entry-bars/:id')
  updateEntryBar(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      level_required?: number;
      image_url?: string;
      is_active?: boolean;
    },
  ) {
    return this.admin.updateEntryBar(BigInt(id), body);
  }

  @Delete('entry-bars/:id')
  deleteEntryBar(@Param('id') id: string) {
    return this.admin.deleteEntryBar(BigInt(id));
  }

  // Room Themes
  @Get('room-themes')
  roomThemes() {
    return this.admin.roomThemes();
  }

  @Post('room-themes')
  createRoomTheme(
    @Body()
    body: {
      name: string;
      coin_cost?: number;
      image_url?: string;
    },
  ) {
    return this.admin.createRoomTheme(body);
  }

  @Patch('room-themes/:id')
  updateRoomTheme(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      coin_cost?: number;
      image_url?: string;
      is_active?: boolean;
    },
  ) {
    return this.admin.updateRoomTheme(BigInt(id), body);
  }

  @Delete('room-themes/:id')
  deleteRoomTheme(@Param('id') id: string) {
    return this.admin.deleteRoomTheme(BigInt(id));
  }

  // Stickers
  @Get('stickers')
  stickers() {
    return this.admin.stickers();
  }

  @Post('stickers')
  createSticker(
    @Body()
    body: {
      name: string;
      coin_cost?: number;
      image_url?: string;
      animation_url?: string;
    },
  ) {
    return this.admin.createSticker(body);
  }

  @Patch('stickers/:id')
  updateSticker(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      coin_cost?: number;
      image_url?: string;
      animation_url?: string;
      is_active?: boolean;
    },
  ) {
    return this.admin.updateSticker(BigInt(id), body);
  }

  @Delete('stickers/:id')
  deleteSticker(@Param('id') id: string) {
    return this.admin.deleteSticker(BigInt(id));
  }

  // Settings
  @Get('settings')
  settings() {
    return this.admin.settings();
  }

  @Patch('settings')
  updateSettings(@Body() body: Record<string, unknown>) {
    return this.admin.updateSettings(body);
  }
}

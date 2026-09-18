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
import { AdminCatalogService } from './admin-catalog.service';
import { AdminService } from './admin.service';
import {
  CreateEntryBarDto,
  CreateFrameDto,
  CreateGiftDto,
  CreateLevelDto,
  CreatePackageDto,
  CreateRoomThemeDto,
  CreateStickerDto,
  LinkUserDto,
  RejectWithdrawalDto,
  StarDto,
  SuspendDto,
  UpdateEntryBarDto,
  UpdateFrameDto,
  UpdateGiftDto,
  UpdateLevelDto,
  UpdatePackageDto,
  UpdateRoomThemeDto,
  UpdateStickerDto,
} from './dto/admin.dto';

@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly catalog: AdminCatalogService,
  ) {}

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
  suspend(@Param('id') id: string, @Body() body?: SuspendDto) {
    return this.admin.suspend(BigInt(id), body?.reason);
  }

  @Post('users/:id/unsuspend')
  unsuspend(@Param('id') id: string) {
    return this.admin.unsuspend(BigInt(id));
  }

  @Post('users/:id/star')
  star(@Param('id') id: string, @Body() body?: StarDto) {
    return this.admin.setStar(BigInt(id), body?.is_star !== false);
  }

  @Post('users/:id/deactivate')
  deactivate(@Param('id') id: string, @Body() body?: SuspendDto) {
    return this.admin.deactivate(BigInt(id), body?.reason);
  }

  @Post('users/:id/link')
  link(@Param('id') id: string, @Body() body?: LinkUserDto) {
    return this.admin.linkExistingUser(BigInt(id), body ?? {});
  }

  @Get('staff')
  staff() {
    return this.admin.staff();
  }

  @Get('packages')
  packages() {
    return this.catalog.packages();
  }

  @Post('packages')
  createPackage(@Body() body: CreatePackageDto) {
    return this.catalog.createPackage(body);
  }

  @Patch('packages/:id')
  updatePackage(@Param('id') id: string, @Body() body: UpdatePackageDto) {
    return this.catalog.updatePackage(BigInt(id), body);
  }

  @Delete('packages/:id')
  deletePackage(@Param('id') id: string) {
    return this.catalog.deletePackage(BigInt(id));
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
    return this.catalog.gifts();
  }

  @Post('gifts')
  createGift(@Body() body: CreateGiftDto) {
    return this.catalog.createGift(body);
  }

  @Patch('gifts/:id')
  updateGift(@Param('id') id: string, @Body() body: UpdateGiftDto) {
    return this.catalog.updateGift(BigInt(id), body);
  }

  @Delete('gifts/:id')
  deleteGift(@Param('id') id: string) {
    return this.catalog.deleteGift(BigInt(id));
  }

  @Get('banners')
  banners() {
    return this.catalog.bannersAdmin();
  }

  @Post('banners')
  createBanner(@Body() body: Record<string, unknown>) {
    return this.catalog.createBanner(body);
  }

  @Patch('banners/:id')
  updateBanner(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.catalog.updateBanner(BigInt(id), body);
  }

  @Delete('banners/:id')
  deleteBanner(@Param('id') id: string) {
    return this.catalog.deleteBanner(BigInt(id));
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
    @Body() body?: RejectWithdrawalDto,
  ) {
    return this.admin.rejectWithdrawal(BigInt(id), body?.reason);
  }

  // Levels
  @Get('levels')
  levels() {
    return this.catalog.levels();
  }

  @Post('levels')
  createLevel(@Body() body: CreateLevelDto) {
    return this.catalog.createLevel(body);
  }

  @Patch('levels/:id')
  updateLevel(@Param('id') id: string, @Body() body: UpdateLevelDto) {
    return this.catalog.updateLevel(Number(id), body);
  }

  @Delete('levels/:id')
  deleteLevel(@Param('id') id: string) {
    return this.catalog.deleteLevel(Number(id));
  }

  // Frames & Role Frames
  @Get('frames')
  frames(@Query('category') category?: string) {
    return this.catalog.frames(category);
  }

  @Post('frames')
  createFrame(@Body() body: CreateFrameDto) {
    return this.catalog.createFrame(body);
  }

  @Patch('frames/:id')
  updateFrame(@Param('id') id: string, @Body() body: UpdateFrameDto) {
    return this.catalog.updateFrame(BigInt(id), body);
  }

  @Delete('frames/:id')
  deleteFrame(@Param('id') id: string) {
    return this.catalog.deleteFrame(BigInt(id));
  }

  // Entry Bars
  @Get('entry-bars')
  entryBars() {
    return this.catalog.entryBars();
  }

  @Post('entry-bars')
  createEntryBar(@Body() body: CreateEntryBarDto) {
    return this.catalog.createEntryBar(body);
  }

  @Patch('entry-bars/:id')
  updateEntryBar(@Param('id') id: string, @Body() body: UpdateEntryBarDto) {
    return this.catalog.updateEntryBar(BigInt(id), body);
  }

  @Delete('entry-bars/:id')
  deleteEntryBar(@Param('id') id: string) {
    return this.catalog.deleteEntryBar(BigInt(id));
  }

  // Room Themes
  @Get('room-themes')
  roomThemes() {
    return this.catalog.roomThemes();
  }

  @Post('room-themes')
  createRoomTheme(@Body() body: CreateRoomThemeDto) {
    return this.catalog.createRoomTheme(body);
  }

  @Patch('room-themes/:id')
  updateRoomTheme(@Param('id') id: string, @Body() body: UpdateRoomThemeDto) {
    return this.catalog.updateRoomTheme(BigInt(id), body);
  }

  @Delete('room-themes/:id')
  deleteRoomTheme(@Param('id') id: string) {
    return this.catalog.deleteRoomTheme(BigInt(id));
  }

  // Stickers
  @Get('stickers')
  stickers() {
    return this.catalog.stickers();
  }

  @Post('stickers')
  createSticker(@Body() body: CreateStickerDto) {
    return this.catalog.createSticker(body);
  }

  @Patch('stickers/:id')
  updateSticker(@Param('id') id: string, @Body() body: UpdateStickerDto) {
    return this.catalog.updateSticker(BigInt(id), body);
  }

  @Delete('stickers/:id')
  deleteSticker(@Param('id') id: string) {
    return this.catalog.deleteSticker(BigInt(id));
  }

  // Settings
  @Get('settings')
  settings() {
    return this.catalog.settings();
  }

  @Patch('settings')
  updateSettings(@Body() body: Record<string, unknown>) {
    return this.catalog.updateSettings(body);
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';
import { Roles } from '../../common/decorators/roles.decorator';
import { MediaService } from '../media/media.service';
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
    private readonly media: MediaService,
  ) {}

  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @Post('upload')
  async upload(@Req() req: FastifyRequest) {
    const url = await this.media.storeFromRequest(req as any);
    if (!url) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'UPLOAD_FAILED',
          message: 'No valid file uploaded or file format not supported',
        },
      });
    }
    return {
      success: true,
      url,
      data: { url },
    };
  }

  @Get('dashboard')
  dashboard(
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.admin.dashboard(period, from, to);
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

  // Countries
  @Get('countries')
  countries() {
    return this.catalog.countries();
  }

  @Post('countries')
  createCountry(@Body() body: { id: string; name: string; flag_emoji?: string; flag_url?: string }) {
    return this.catalog.createCountry(body);
  }

  @Patch('countries/:id')
  updateCountry(
    @Param('id') id: string,
    @Body() body: { name?: string; flag_emoji?: string; flag_url?: string; is_active?: boolean },
  ) {
    return this.catalog.updateCountry(id, body);
  }

  @Delete('countries/:id')
  deleteCountry(@Param('id') id: string) {
    return this.catalog.deleteCountry(id);
  }

  @Post('countries/:id/approve')
  approveCountry(@Param('id') id: string) {
    return this.catalog.approveCountry(id);
  }

  @Post('countries/:id/reject')
  rejectCountry(@Param('id') id: string) {
    return this.catalog.rejectCountry(id);
  }

  // Agencies
  @Get('agencies')
  agencies(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.admin.agencies(Number(page ?? 1), Number(limit ?? 20), status);
  }

  @Post('agencies/affiliations/:id/clear-cooldown')
  clearAgencyCooldown(@Param('id') id: string) {
    return this.admin.clearAgencyCooldown(BigInt(id));
  }

  // Star Accounts
  @Get('star-accounts')
  starAccounts() {
    return this.admin.starAccounts();
  }

  @Post('star-accounts/:id/update')
  updateStarAccount(
    @Param('id') id: string,
    @Body() body: { star_rank: number; star_bio_tag?: string },
  ) {
    return this.admin.updateStarAccount(BigInt(id), body);
  }

  @Post('star-accounts/:id/remove')
  removeStarAccount(@Param('id') id: string) {
    return this.admin.removeStarAccount(BigInt(id));
  }

  @Post('star-accounts/reorder')
  reorderStarAccounts(@Body() body: { ranks: Array<{ user_id: number; star_rank: number }> }) {
    return this.admin.reorderStarAccounts(body.ranks ?? []);
  }

  // Party Room Analytics
  @Get('party-room-analytics')
  partyRoomAnalytics() {
    return this.admin.partyRoomAnalytics();
  }

  @Get('party-room-analytics/users/:id/sessions')
  userPartyRoomSessions(@Param('id') id: string) {
    return this.admin.userPartyRoomSessions(BigInt(id));
  }

  @Post('party-room-analytics/sessions/:id/suspend')
  suspendPartyRoomSession(@Param('id') id: string) {
    return this.admin.suspendPartyRoomSession(BigInt(id));
  }

  @Post('party-room-analytics/sessions/close-stale')
  closeStalePartyRoomSessions() {
    return this.admin.closeStalePartyRoomSessions();
  }

  // User Location Compliance
  @Get('user-location-compliance')
  userLocationCompliance(
    @Query('q') q?: string,
    @Query('country') country?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.admin.userLocationCompliance(q, country, Number(page ?? 1), Number(limit ?? 25));
  }

  @Get('user-location-compliance/export')
  exportLocationComplianceCsv() {
    return this.admin.exportLocationComplianceCsv();
  }

  // User Reports / Moderation
  @Get('moderation/reports')
  moderationReports(
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.admin.moderationReports(status, q, Number(page ?? 1), Number(limit ?? 25));
  }

  @Get('moderation/reports/:id')
  moderationReportDetail(@Param('id') id: string) {
    return this.admin.moderationReportDetail(BigInt(id));
  }

  @Post('moderation/reports/:id/resolve')
  resolveModerationReport(@Param('id') id: string, @Body() body?: { notes?: string }) {
    return this.admin.resolveModerationReport(BigInt(id), body?.notes);
  }

  @Post('moderation/reports/:id/dismiss')
  dismissModerationReport(@Param('id') id: string) {
    return this.admin.dismissModerationReport(BigInt(id));
  }

  @Post('moderation/reports/:id/reopen')
  reopenModerationReport(@Param('id') id: string) {
    return this.admin.reopenModerationReport(BigInt(id));
  }

  @Post('moderation/users/:id/clear-review')
  clearUserReview(@Param('id') id: string) {
    return this.admin.clearUserReview(BigInt(id));
  }

  // Media Posts & Reels
  @Get('media/posts')
  adminPosts(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
  ) {
    return this.admin.adminPosts(Number(page ?? 1), Number(limit ?? 20), q);
  }

  @Post('media/posts')
  createMediaPost(
    @Body()
    body: {
      user_id?: number | string;
      username?: string;
      email?: string;
      file_url: string;
      caption?: string;
      thumbnail_url?: string;
    },
  ) {
    return this.admin.createAdminMediaPost('post', body);
  }

  @Delete('media/posts/:id')
  deleteMediaPost(@Param('id') id: string) {
    return this.admin.deleteMediaPost(BigInt(id));
  }

  @Post('media/reels')
  createMediaReel(
    @Body()
    body: {
      user_id?: number | string;
      username?: string;
      email?: string;
      file_url: string;
      caption?: string;
      thumbnail_url?: string;
    },
  ) {
    return this.admin.createAdminMediaPost('reel', body);
  }

  @Get('media/reels')
  adminReels(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
  ) {
    return this.admin.adminReels(Number(page ?? 1), Number(limit ?? 20), q);
  }

  @Delete('media/reels/:id')
  deleteMediaReel(@Param('id') id: string) {
    return this.admin.deleteMediaReel(BigInt(id));
  }

  // Transactions
  @Get('transactions')
  adminTransactions(
    @Query('source') source?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.admin.adminTransactions(source, status, q, Number(page ?? 1), Number(limit ?? 25));
  }

  @Get('transactions/fetch')
  adminTransactionsFetch(
    @Query('source') source?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.admin.adminTransactions(source, status, q, Number(page ?? 1), Number(limit ?? 25));
  }

  @Get('transactions/export')
  exportTransactionsCsv() {
    return this.admin.exportTransactionsCsv();
  }
}

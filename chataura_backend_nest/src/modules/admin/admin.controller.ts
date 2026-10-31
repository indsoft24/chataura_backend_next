import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';
import { Roles } from '../../common/decorators/roles.decorator';
import { MinTier } from '../../common/decorators/min-tier.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { tierOf } from '../../common/admin-tier';
import { MediaService } from '../media/media.service';
import { RocketLaunchService } from '../room/rocket-launch.service';
import { assetKeyFor, AssetSlot, LevelInput, sniffAsset } from '../room/rocket-levels';
import { FxAssetsService } from '../fx-assets/fx-assets.service';
import { RoomRewardAdminService } from '../room/room-reward/room-reward-admin.service';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminRechargeService } from './admin-recharge.service';
import { AdminService } from './admin.service';
import { CoinSellerService } from '../wallet/coin-seller.service';
import {
  AdjustBalanceDto,
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

/** Settings keys a CEO may read/write: Party Room Bonuses, Staff Commissions, coin-seller template. */
const CEO_SETTING_KEYS = [
  'spin_cost',
  'coin_to_xp_ratio',
  'gift_commission_pct',
  'star_chat_commission_pct',
  'gems_per_coin',
  'cashout_enabled',
  'earnings_purchase_enabled',
  'coin_seller_message_template',
];

const isSuperadmin = (u: AuthUser) => tierOf(u.role, u.staffBadgeType) === 'superadmin';

function parseId(id: string): bigint {
  if (!/^\d{1,18}$/.test(id)) throw new BadRequestException('Invalid id');
  return BigInt(id);
}

@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly catalog: AdminCatalogService,
    private readonly recharges: AdminRechargeService,
    private readonly media: MediaService,
    private readonly rockets: RocketLaunchService,
    private readonly fxAssets: FxAssetsService,
    private readonly roomRewards: RoomRewardAdminService,
    private readonly coinSellers: CoinSellerService,
  ) {}

  // ---- Coin Sellers (offline recharge via WhatsApp) ----

  @MinTier('ceo')
  @Get('coin-sellers')
  coinSellerList() {
    return this.coinSellers.adminList();
  }

  @MinTier('ceo')
  @Post('coin-sellers')
  coinSellerCreate(@Body() body: Record<string, unknown>) {
    return this.coinSellers.adminCreate(body);
  }

  @MinTier('ceo')
  @Put('coin-sellers/order')
  coinSellerReorder(@Body() body: { ids?: unknown }) {
    return this.coinSellers.adminReorder(body?.ids);
  }

  @MinTier('ceo')
  @Patch('coin-sellers/:id')
  coinSellerUpdate(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.coinSellers.adminUpdate(parseId(id), body);
  }

  @MinTier('ceo')
  @Delete('coin-sellers/:id')
  coinSellerDelete(@Param('id') id: string) {
    return this.coinSellers.adminDelete(parseId(id));
  }

  // ---- Room Reward Levels ----

  @MinTier('manager')
  @Get('room-rewards/overview')
  roomRewardOverview() {
    return this.roomRewards.overview();
  }

  @MinTier('manager')
  @Get('room-rewards/levels')
  roomRewardLevels() {
    return this.roomRewards.levels();
  }

  /** Validate + show how many rooms would complete each level right away. Writes nothing. */
  @MinTier('manager')
  @Post('room-rewards/levels/preview')
  roomRewardPreview(@Body() body: { levels?: [] }) {
    return this.roomRewards.preview(body);
  }

  @MinTier('manager')
  @Put('room-rewards/levels')
  saveRoomRewardLevels(@CurrentUser() user: AuthUser, @Body() body: { levels?: [] }) {
    return this.roomRewards.saveLevels(body, user.id);
  }

  @MinTier('manager')
  @Get('room-rewards/settings')
  roomRewardSettings() {
    return this.roomRewards.settings();
  }

  @MinTier('manager')
  @Patch('room-rewards/settings')
  updateRoomRewardSettings(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.roomRewards.updateSettings(body, user.id);
  }

  @MinTier('manager')
  @Get('room-rewards/rooms')
  roomRewardRooms(
    @Query() q: { search?: string; pending?: string; page?: string; limit?: string },
  ) {
    return this.roomRewards.rooms(q);
  }

  @MinTier('manager')
  @Get('room-rewards/payouts')
  roomRewardPayouts(
    @Query() q: { room?: string; user?: string; page?: string; limit?: string },
  ) {
    return this.roomRewards.payouts(q);
  }

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

  /** Re-import FX pack from a server directory containing MANIFEST.json. */
  @Throttle({ default: { limit: 2, ttl: seconds(300) } })
  @MinTier('manager')
  @Post('fx-assets/import')
  async importFxAssets(@Body() body: { dir?: string; out?: string }) {
    const dir = body?.dir?.trim();
    if (!dir) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'FX_DIR_REQUIRED',
          message: 'Body.dir must point to an extracted FX pack on this server',
        },
      });
    }
    const result = await this.fxAssets.importFromDir(dir, {
      writeUrlsPath: body?.out?.trim() || undefined,
    });
    return {
      ok: result.ok,
      failed: result.failed,
      version: result.version,
      map: result.map,
    };
  }

  @MinTier('ceo')
  @Get('dashboard')
  dashboard(
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.admin.dashboard(period, from, to);
  }

  @MinTier('ceo')
  @Get('users/:id/analytics')
  userAnalytics(@Param('id') id: string) {
    return this.admin.userAnalytics(BigInt(id));
  }

  @Get('users')
  users(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('role') role?: string,
    @Query('star') star?: string,
    @Query('online') online?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: string,
  ) {
    return this.admin.users(q, Number(page ?? 1), Number(limit ?? 20), {
      status,
      role,
      star,
      online,
      sort,
      order,
    });
  }

  @MinTier('manager')
  @Post('users/:id/restore')
  restore(@Param('id') id: string) {
    return this.admin.restoreUser(BigInt(id));
  }

  @Post('users/:id/suspend')
  suspend(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() body?: SuspendDto,
  ) {
    return this.admin.suspend(actor, BigInt(id), body?.reason);
  }

  @Post('users/:id/unsuspend')
  unsuspend(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.admin.unsuspend(actor, BigInt(id));
  }

  @MinTier('manager')
  @Post('users/:id/star')
  star(@Param('id') id: string, @Body() body?: StarDto) {
    return this.admin.setStar(BigInt(id), body?.is_star !== false);
  }

  @MinTier('manager')
  @Post('users/:id/deactivate')
  deactivate(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() body?: SuspendDto,
  ) {
    return this.admin.deactivate(actor, BigInt(id), body?.reason);
  }

  // Coins/gems are minted or removed only here, only by the superadmin. Sellers then
  // distribute what they bought from their own balance via POST /wallet/transfer.
  @MinTier('superadmin')
  @Post('users/:id/adjust-balance')
  adjustBalance(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() body: AdjustBalanceDto,
  ) {
    return this.admin.adjustBalance(BigInt(id), body, admin.id);
  }

  @MinTier('manager')
  @Post('users/:id/link')
  link(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() body?: LinkUserDto,
  ) {
    return this.admin.linkExistingUser(actor, BigInt(id), body ?? {});
  }

  @MinTier('manager')
  @Get('staff')
  staff() {
    return this.admin.staff();
  }

  @MinTier('ceo')
  @Get('packages')
  packages() {
    return this.catalog.packages();
  }

  @MinTier('ceo')
  @Post('packages')
  createPackage(@Body() body: CreatePackageDto) {
    return this.catalog.createPackage(body);
  }

  @MinTier('ceo')
  @Patch('packages/:id')
  updatePackage(@Param('id') id: string, @Body() body: UpdatePackageDto) {
    return this.catalog.updatePackage(BigInt(id), body);
  }

  @MinTier('ceo')
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

  @MinTier('manager')
  @Get('gifts')
  gifts() {
    return this.catalog.gifts();
  }

  @MinTier('manager')
  @Post('gifts')
  createGift(@Body() body: CreateGiftDto) {
    return this.catalog.createGift(body);
  }

  @MinTier('manager')
  @Patch('gifts/:id')
  updateGift(@Param('id') id: string, @Body() body: UpdateGiftDto) {
    return this.catalog.updateGift(BigInt(id), body);
  }

  @MinTier('manager')
  @Delete('gifts/:id')
  deleteGift(@Param('id') id: string) {
    return this.catalog.deleteGift(BigInt(id));
  }

  @MinTier('manager')
  @Get('banners')
  banners() {
    return this.catalog.bannersAdmin();
  }

  @MinTier('manager')
  @Post('banners')
  createBanner(@Body() body: Record<string, unknown>) {
    return this.catalog.createBanner(body);
  }

  @MinTier('manager')
  @Patch('banners/:id')
  updateBanner(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.catalog.updateBanner(BigInt(id), body);
  }

  @MinTier('manager')
  @Delete('banners/:id')
  deleteBanner(@Param('id') id: string) {
    return this.catalog.deleteBanner(BigInt(id));
  }

  @MinTier('ceo')
  @Get('withdrawals')
  withdrawals() {
    return this.admin.withdrawals();
  }

  @MinTier('ceo')
  @Post('withdrawals/:id/approve')
  approveWithdrawal(@Param('id') id: string) {
    return this.admin.approveWithdrawal(BigInt(id));
  }

  @MinTier('ceo')
  @Post('withdrawals/:id/reject')
  rejectWithdrawal(
    @Param('id') id: string,
    @Body() body?: RejectWithdrawalDto,
  ) {
    return this.admin.rejectWithdrawal(BigInt(id), body?.reason);
  }

  // Levels
  @MinTier('manager')
  @Get('levels')
  levels() {
    return this.catalog.levels();
  }

  @MinTier('manager')
  @Post('levels')
  createLevel(@Body() body: CreateLevelDto) {
    return this.catalog.createLevel(body);
  }

  @MinTier('manager')
  @Patch('levels/:id')
  updateLevel(@Param('id') id: string, @Body() body: UpdateLevelDto) {
    return this.catalog.updateLevel(Number(id), body);
  }

  @MinTier('manager')
  @Delete('levels/:id')
  deleteLevel(@Param('id') id: string) {
    return this.catalog.deleteLevel(Number(id));
  }

  // Frames & Role Frames
  @MinTier('manager')
  @Get('frames')
  frames(@Query('category') category?: string) {
    return this.catalog.frames(category);
  }

  @MinTier('manager')
  @Post('frames')
  createFrame(@Body() body: CreateFrameDto) {
    return this.catalog.createFrame(body);
  }

  @MinTier('manager')
  @Patch('frames/:id')
  updateFrame(@Param('id') id: string, @Body() body: UpdateFrameDto) {
    return this.catalog.updateFrame(BigInt(id), body);
  }

  @MinTier('manager')
  @Delete('frames/:id')
  deleteFrame(@Param('id') id: string) {
    return this.catalog.deleteFrame(BigInt(id));
  }

  // Entry Bars
  @MinTier('manager')
  @Get('entry-bars')
  entryBars() {
    return this.catalog.entryBars();
  }

  @MinTier('manager')
  @Post('entry-bars')
  createEntryBar(@Body() body: CreateEntryBarDto) {
    return this.catalog.createEntryBar(body);
  }

  @MinTier('manager')
  @Patch('entry-bars/:id')
  updateEntryBar(@Param('id') id: string, @Body() body: UpdateEntryBarDto) {
    return this.catalog.updateEntryBar(BigInt(id), body);
  }

  @MinTier('manager')
  @Delete('entry-bars/:id')
  deleteEntryBar(@Param('id') id: string) {
    return this.catalog.deleteEntryBar(BigInt(id));
  }

  // Room Themes
  @MinTier('manager')
  @Get('room-themes')
  roomThemes() {
    return this.catalog.roomThemes();
  }

  @MinTier('manager')
  @Post('room-themes')
  createRoomTheme(@Body() body: CreateRoomThemeDto) {
    return this.catalog.createRoomTheme(body);
  }

  @MinTier('manager')
  @Patch('room-themes/:id')
  updateRoomTheme(@Param('id') id: string, @Body() body: UpdateRoomThemeDto) {
    return this.catalog.updateRoomTheme(BigInt(id), body);
  }

  @MinTier('manager')
  @Delete('room-themes/:id')
  deleteRoomTheme(@Param('id') id: string) {
    return this.catalog.deleteRoomTheme(BigInt(id));
  }

  // Stickers
  @MinTier('manager')
  @Get('stickers')
  stickers() {
    return this.catalog.stickers();
  }

  @MinTier('manager')
  @Post('stickers')
  createSticker(@Body() body: CreateStickerDto) {
    return this.catalog.createSticker(body);
  }

  @MinTier('manager')
  @Patch('stickers/:id')
  updateSticker(@Param('id') id: string, @Body() body: UpdateStickerDto) {
    return this.catalog.updateSticker(BigInt(id), body);
  }

  @MinTier('manager')
  @Delete('stickers/:id')
  deleteSticker(@Param('id') id: string) {
    return this.catalog.deleteSticker(BigInt(id));
  }

  // Settings
  // CEOs see and edit only CEO_SETTING_KEYS (bonuses, commissions, coin-seller template); the rest is superadmin-only.
  @MinTier('ceo')
  @Get('settings')
  async settings(@CurrentUser() actor: AuthUser) {
    const res = await this.catalog.settings();
    if (isSuperadmin(actor)) return res;
    const s = res.settings as Record<string, unknown>;
    return { settings: Object.fromEntries(CEO_SETTING_KEYS.filter((k) => k in s).map((k) => [k, s[k]])) };
  }

  @MinTier('ceo')
  @Patch('settings')
  updateSettings(@CurrentUser() actor: AuthUser, @Body() body: Record<string, unknown>) {
    const blocked = Object.keys(body ?? {}).filter((k) => !CEO_SETTING_KEYS.includes(k));
    if (!isSuperadmin(actor) && blocked.length) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'FORBIDDEN', message: `Only the superadmin can change: ${blocked.join(', ')}` },
      });
    }
    return this.catalog.updateSettings(body);
  }

  // Countries
  @MinTier('manager')
  @Get('countries')
  countries() {
    return this.catalog.countries();
  }

  @MinTier('manager')
  @Post('countries')
  createCountry(@Body() body: { id: string; name: string; flag_emoji?: string; flag_url?: string }) {
    return this.catalog.createCountry(body);
  }

  @MinTier('manager')
  @Patch('countries/:id')
  updateCountry(
    @Param('id') id: string,
    @Body() body: { name?: string; flag_emoji?: string; flag_url?: string; is_active?: boolean },
  ) {
    return this.catalog.updateCountry(id, body);
  }

  @MinTier('manager')
  @Delete('countries/:id')
  deleteCountry(@Param('id') id: string) {
    return this.catalog.deleteCountry(id);
  }

  @MinTier('manager')
  @Post('countries/:id/approve')
  approveCountry(@Param('id') id: string) {
    return this.catalog.approveCountry(id);
  }

  @MinTier('manager')
  @Post('countries/:id/reject')
  rejectCountry(@Param('id') id: string) {
    return this.catalog.rejectCountry(id);
  }

  // Agencies
  @MinTier('manager')
  @Get('agencies')
  agencies(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.admin.agencies(Number(page ?? 1), Number(limit ?? 20), status);
  }

  @MinTier('manager')
  @Post('agencies/affiliations/:id/clear-cooldown')
  clearAgencyCooldown(@Param('id') id: string) {
    return this.admin.clearAgencyCooldown(BigInt(id));
  }

  // Star Accounts
  @MinTier('manager')
  @Get('star-accounts')
  starAccounts() {
    return this.admin.starAccounts();
  }

  @MinTier('manager')
  @Post('star-accounts/:id/update')
  updateStarAccount(
    @Param('id') id: string,
    @Body() body: { star_rank: number; star_bio_tag?: string },
  ) {
    return this.admin.updateStarAccount(BigInt(id), body);
  }

  @MinTier('manager')
  @Post('star-accounts/:id/support-frame')
  setStarSupportFrame(@Param('id') id: string, @Body() body: { enabled?: boolean }) {
    return this.admin.setStarSupportFrame(BigInt(id), body?.enabled !== false);
  }

  @MinTier('manager')
  @Post('star-accounts/:id/remove')
  removeStarAccount(@Param('id') id: string) {
    return this.admin.removeStarAccount(BigInt(id));
  }

  @MinTier('manager')
  @Post('star-accounts/reorder')
  reorderStarAccounts(@Body() body: { ranks: Array<{ user_id: number; star_rank: number }> }) {
    return this.admin.reorderStarAccounts(body.ranks ?? []);
  }

  // Party Room Analytics
  @Get('party-room-analytics')
  partyRoomAnalytics(@Query() query: Record<string, string | undefined>) {
    return this.admin.partyRoomAnalytics(query);
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
  userLocationCompliance(@Query() query: Record<string, string | undefined>) {
    return this.admin.userLocationCompliance(query);
  }

  @Get('user-location-compliance/export')
  exportLocationComplianceCsv(@Query() query: Record<string, string | undefined>) {
    return this.admin.exportLocationComplianceCsv(query);
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
  adminPosts(@Query() query: Record<string, string | undefined>) {
    return this.admin.adminMedia('post', query);
  }

  @Post('media/:id/restore')
  restoreMedia(@Param('id') id: string) {
    return this.admin.restoreMedia(BigInt(id));
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
  adminReels(@Query() query: Record<string, string | undefined>) {
    return this.admin.adminMedia('reel', query);
  }

  @Delete('media/reels/:id')
  deleteMediaReel(@Param('id') id: string) {
    return this.admin.deleteMediaReel(BigInt(id));
  }

  // Transactions
  @MinTier('ceo')
  @Get('transactions')
  adminTransactions(@Query() query: Record<string, string | undefined>) {
    return this.admin.adminTransactions(query);
  }

  @MinTier('ceo')
  @Get('transactions/fetch')
  adminTransactionsFetch(@Query() query: Record<string, string | undefined>) {
    return this.admin.adminTransactions(query);
  }

  @MinTier('ceo')
  @Get('transactions/export')
  exportTransactionsCsv(@Query() query: Record<string, string | undefined>) {
    return this.admin.exportTransactionsCsv(query);
  }

  // Recharges (real-money coin purchases) + GST reporting
  @MinTier('ceo')
  @Get('recharges')
  adminRecharges(@Query() query: Record<string, string | undefined>) {
    return this.recharges.list(query);
  }

  @MinTier('ceo')
  @Get('recharges/export')
  exportRechargesExcel(@Query() query: Record<string, string | undefined>) {
    return this.recharges.exportExcel(query);
  }

  @MinTier('ceo')
  @Get('recharges/gst-config')
  rechargeGstConfig() {
    return this.recharges.gstConfig().then((config) => ({ config }));
  }

  @MinTier('ceo')
  @Patch('recharges/gst-config')
  updateRechargeGstConfig(@Body() body: Record<string, unknown>) {
    return this.recharges.updateGstConfig(body);
  }

  @Throttle({ default: { limit: 6, ttl: seconds(60) } })
  @MinTier('ceo')
  @Post('recharges/sync')
  syncRecharges(@Body() body: { from?: string; to?: string }) {
    return this.recharges.syncWithRazorpay(body ?? {});
  }

  @MinTier('ceo')
  @Post('recharges/import')
  importRazorpayRecharges(@Body() body: { payment_ids?: string[] }) {
    return this.recharges.importRazorpayPayments(body ?? {});
  }

  @MinTier('ceo')
  @Post('recharges/:id/credit')
  creditReviewedRecharge(@Param('id') id: string) {
    if (!/^\d{1,18}$/.test(id)) throw new BadRequestException('Invalid recharge id');
    return this.recharges.creditReviewed(BigInt(id));
  }

  @MinTier('ceo')
  @Post('recharges/:id/mark-paid')
  markReviewedRechargePaid(@Param('id') id: string, @Body() body: { note?: string }) {
    if (!/^\d{1,18}$/.test(id)) throw new BadRequestException('Invalid recharge id');
    return this.recharges.markReviewedPaid(BigInt(id), body ?? {});
  }

  @MinTier('ceo')
  @Patch('recharges/:id/place-of-supply')
  setRechargePlaceOfSupply(@Param('id') id: string, @Body() body: { state?: string | null }) {
    if (!/^\d{1,18}$/.test(id)) throw new BadRequestException('Invalid recharge id');
    return this.recharges.setPlaceOfSupply(BigInt(id), body);
  }

  // Rockit crowdfund campaigns + Rocket ladder levels
  @MinTier('manager')
  @Get('rockit/campaigns')
  listRockitCampaigns() {
    return this.rockets.listCampaigns();
  }

  @MinTier('manager')
  @Post('rockit/campaigns')
  upsertRockitCampaign(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      id?: number | string;
      name?: string;
      launch_threshold_coins?: number;
      reward_pool_percentage?: number;
      max_winners_count?: number;
      reward_distribution_rules?: number[];
      minimum_contribution_required?: number;
      eligible_room_types?: string[];
      rockit_duration_seconds?: number;
      status?: boolean;
      daily_reset_enabled?: boolean;
      reset_timezone?: string;
      reset_hour?: number;
      expiry_mode?: string;
      carry_overflow?: boolean;
    },
  ) {
    return this.rockets.upsertCampaign(body, user.id);
  }

  @MinTier('manager')
  @Delete('rockit/campaigns/:id')
  deleteRockitCampaign(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rockets.deleteCampaign(parseId(id), user.id);
  }

  @MinTier('manager')
  @Put('rockit/campaigns/:id/levels')
  saveRockitLevels(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { levels?: LevelInput[] },
  ) {
    return this.rockets.saveLevels(parseId(id), body?.levels ?? [], user.id);
  }

  /** Multipart upload of a level's launch/station video or badge image → GCS + FX catalog. */
  @Throttle({ default: { limit: 20, ttl: seconds(60) } })
  @MinTier('manager')
  @Post('rockit/campaigns/:id/levels/:level/assets/:slot')
  async uploadRockitLevelAsset(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('level') levelRaw: string,
    @Param('slot') slotRaw: string,
    @Req() req: FastifyRequest,
  ) {
    const level = Number(levelRaw);
    const slot = slotRaw as AssetSlot;
    if (!Number.isInteger(level) || level < 1 || level > 50 || !['launch', 'station', 'badge'].includes(slot)) {
      throw new BadRequestException({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid level or asset slot' },
      });
    }
    const part = await (req as unknown as { file: () => Promise<{ filename: string; toBuffer: () => Promise<Buffer> } | undefined> })
      .file()
      .catch(() => undefined);
    if (!part) {
      throw new BadRequestException({
        success: false,
        error: { code: 'UPLOAD_FAILED', message: 'No file uploaded' },
      });
    }
    const buffer = await part.toBuffer();
    const sniff = sniffAsset(slot, part.filename || '', buffer);
    if (!sniff.ok) {
      throw new BadRequestException({
        success: false,
        error: { code: 'INVALID_ASSET', message: sniff.error },
      });
    }
    const assetKey = assetKeyFor(slot, level);
    const asset = await this.fxAssets.uploadBuffer({
      assetKey,
      category: 'rocket',
      mediaType: sniff.mediaType,
      objectDir: `fx/v1/rocket/lv${level}`,
      filePrefix: slot,
      ext: sniff.ext,
      buffer,
      androidUsage: `Rocket LV${level} ${slot}`,
    });
    const result = await this.rockets.attachLevelAsset(parseId(id), level, slot, assetKey, user.id);
    return { asset, ...result };
  }

  @MinTier('manager')
  @Get('rockit/audit')
  rockitAudit(@Query('campaign_id') campaignId?: string, @Query('limit') limit?: string) {
    return this.rockets.auditLog(campaignId ? parseId(campaignId) : undefined, Number(limit) || 50);
  }

  @MinTier('manager')
  @Post('rockit/audit/:id/restore')
  restoreRockitAudit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rockets.restoreFromAudit(parseId(id), user.id);
  }
}

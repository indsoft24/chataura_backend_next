import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { BonusSpinService } from './bonus-spin.service';
import { GamificationService } from './gamification.service';

@Controller()
export class GamificationController {
  constructor(
    private readonly game: GamificationService,
    private readonly bonusSpin: BonusSpinService,
  ) {}

  @Get(['user/level', 'profile/level'])
  getLevel(@CurrentUser() user: AuthUser) {
    return this.game.getLevel(user.id);
  }

  @Get(['levels', 'profile/levels'])
  catalog(@CurrentUser() user: AuthUser) {
    return this.game.catalog(user.id);
  }

  @Post(['xp/add', 'user/level/add-xp'])
  addXp(@CurrentUser() user: AuthUser, @Body() body: { amount: number }) {
    return this.game.addXp(user.id, Number(body.amount));
  }

  @Get('profile/details')
  details(@CurrentUser() user: AuthUser) {
    return this.game.profileDetails(user.id);
  }

  @Get(['profile/frames', 'profile/frames/all', 'store/frames'])
  frames(@CurrentUser() user: AuthUser) {
    return this.game.frames(user.id);
  }

  @Post(['profile/select-frame', 'store/frames/select'])
  selectFrame(
    @CurrentUser() user: AuthUser,
    @Body() body: { frame_id: number | string },
  ) {
    return this.game.selectFrame(user.id, BigInt(body.frame_id));
  }

  @Post(['profile/frames/:frameId/purchase', 'store/frames/purchase'])
  purchaseFrame(
    @CurrentUser() user: AuthUser,
    @Param('frameId') frameId: string,
    @Body() body: { frame_id?: number | string; days?: number },
  ) {
    const id = frameId && frameId !== 'purchase' ? frameId : body.frame_id;
    return this.game.purchaseFrame(
      user.id,
      BigInt(String(id)),
      body?.days,
    );
  }

  @Get('profile/entry-bars/all')
  entryBars(@CurrentUser() user: AuthUser) {
    return this.game.entryBars(user.id);
  }

  @Post('profile/select-entry-bar')
  selectEntryBar(
    @CurrentUser() user: AuthUser,
    @Body() body: { entry_bar_id: number | string },
  ) {
    return this.game.selectEntryBar(user.id, BigInt(body.entry_bar_id));
  }

  @Get('role-frames')
  roleFrames() {
    return this.game.roleFramesCatalog();
  }

  @Get('role-frames/mine')
  myRoleFrames(@CurrentUser() user: AuthUser) {
    return this.game.myRoleFrames(user.id);
  }

  @Post('role-frames/select')
  selectRoleFrame(
    @CurrentUser() user: AuthUser,
    @Body() body: { role_frame_id?: number | string },
  ) {
    return this.game.selectRoleFrame(user.id, body);
  }

  @Get('profile/upgrade-roadmap')
  upgradeRoadmap(@CurrentUser() user: AuthUser) {
    return this.game.upgradeRoadmap(user.id);
  }

  @Get('spin/prizes')
  spinPrizes() {
    return this.bonusSpin.prizes();
  }

  @Post('spin/play')
  spinPlay(@CurrentUser() user: AuthUser) {
    return this.bonusSpin.play(user.id);
  }

  @Get('bonuses/config')
  bonusConfig() {
    return this.bonusSpin.bonusConfig();
  }

  @Get('bonuses/status')
  bonusStatus(@CurrentUser() user: AuthUser) {
    return this.bonusSpin.bonusStatus(user.id);
  }

  @Post('bonuses/claim-admob')
  claimAdmob(@CurrentUser() user: AuthUser) {
    return this.bonusSpin.claimAdmob(user.id);
  }

  @Post('bonuses/claim-game')
  claimGame(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      game_type: string;
      score?: number;
      result?: string;
      won?: boolean;
      winner?: string;
      accept_fee?: boolean;
    },
  ) {
    return this.bonusSpin.claimGame(user.id, body);
  }

  @Post('bonuses/claim-streak')
  claimStreak(@CurrentUser() user: AuthUser) {
    return this.bonusSpin.claimStreak(user.id);
  }
}

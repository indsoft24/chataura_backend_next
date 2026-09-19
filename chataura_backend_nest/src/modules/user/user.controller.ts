import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { SkipEmailVerified } from '../../common/decorators/skip-email-verified.decorator';
import { UserService } from './user.service';

function targetId(body: Record<string, unknown>, ...keys: string[]): bigint {
  for (const k of keys) {
    const v = body[k];
    if (v !== undefined && v !== null && v !== '') {
      return BigInt(String(v));
    }
  }
  throw new BadRequestException({
    success: false,
    error: { code: 'VALIDATION_ERROR', message: 'user_id is required' },
  });
}

@Controller()
export class UserController {
  constructor(private readonly users: UserService) {}

  // ---- me / profile (email verify optional for me) ----

  @SkipEmailVerified()
  @Get('users/me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.me(user.id);
  }

  @Get('users/me/invite')
  invite(@CurrentUser() user: AuthUser) {
    return this.users.invite(user.id);
  }

  @Get('users/me/availability')
  availability(@CurrentUser() user: AuthUser) {
    return this.users.availability(user.id);
  }

  @Post('invite/apply')
  applyInvite(
    @CurrentUser() user: AuthUser,
    @Body() body: { invite_code?: string; code?: string },
  ) {
    return this.users.applyInvite(
      user.id,
      String(body.invite_code ?? body.code ?? ''),
    );
  }

  @Patch('users/me')
  updateMe(
    @CurrentUser() user: AuthUser,
    @Body()
    body: { display_name?: string; avatar_url?: string; country?: string },
  ) {
    return this.users.updateMe(user.id, body);
  }

  @Get('user/profile')
  profile(@CurrentUser() user: AuthUser) {
    return this.users.profile(user.id);
  }

  @Post('user/update')
  async updateProfile(
    @CurrentUser() user: AuthUser,
    @Req() req: FastifyRequest,
    @Body() body?: Record<string, unknown>,
  ) {
    let payload: Record<string, any> = body ? { ...body } : {};
    const reqAny = req as any;
    if (typeof reqAny.isMultipart === 'function' && reqAny.isMultipart()) {
      const parts = reqAny.parts();
      for await (const part of parts) {
        if (part.type === 'file') {
          if ((part.fieldname === 'avatar' || part.fieldname === 'image') && part.filename) {
            const dest = await this.users.saveAvatar(part.filename, part.file);
            if (dest) payload.avatar_url = dest;
          } else if (part.file) {
            part.file.resume();
          }
        } else {
          payload[part.fieldname] = part.value;
        }
      }
    }
    return this.users.updateProfile(user.id, payload);
  }

  @Post('user/privacy')
  privacy(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      private_account?: boolean;
      is_private?: boolean;
      show_online_status?: boolean;
    },
  ) {
    return this.users.privacy(user.id, body);
  }

  @Post('user/notifications')
  notifications(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, boolean | undefined>,
  ) {
    return this.users.notifications(user.id, body);
  }

  @Post('user/update-language')
  updateLanguage(
    @CurrentUser() user: AuthUser,
    @Body() body: { language?: string; lang?: string },
  ) {
    return this.users.updateLanguage(
      user.id,
      body.language ?? body.lang ?? 'en',
    );
  }

  @Public()
  @Get('users/search')
  search(
    @Query('q') q?: string,
    @Query('query') query?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.users.search(
      q ?? query ?? '',
      Number(page ?? 1),
      Number(limit ?? 20),
    );
  }

  @Public()
  @Get('users/star-accounts')
  starAccounts(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.users.starAccounts(Number(page ?? 1), Number(limit ?? 20));
  }

  @Public()
  @Get('users/star-accounts/:userId')
  starAccount(@Param('userId') userId: string) {
    return this.users.starAccount(BigInt(userId));
  }

  @Public()
  @Get('users/report-reasons')
  reportReasons() {
    return this.users.reportReasons();
  }

  @Post('users/:userId/report')
  report(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Body() body: { reason: string; description?: string },
  ) {
    return this.users.report(
      user.id,
      BigInt(userId),
      body.reason,
      body.description,
    );
  }

  @Public()
  @Get('users/:id/gifts')
  giftsReceived(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('direction') direction?: string,
  ) {
    return this.users.giftGallery(
      BigInt(id),
      Number(page ?? 1),
      Number(limit ?? 20),
      direction === 'sent' ? 'sent' : 'received',
    );
  }

  @Public()
  @Get('users/:id/gifts/sent')
  giftsSent(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.users.giftGallery(
      BigInt(id),
      Number(page ?? 1),
      Number(limit ?? 20),
      'sent',
    );
  }

  @Public()
  @Get('users/:id')
  showUser(
    @CurrentUser() user: AuthUser | undefined,
    @Param('id') id: string,
  ) {
    return this.users.show(user?.id ?? null, BigInt(id));
  }

  @Public()
  @Get('user/:id')
  showUserLegacy(
    @CurrentUser() user: AuthUser | undefined,
    @Param('id') id: string,
  ) {
    return this.users.show(user?.id ?? null, BigInt(id));
  }

  @Public()
  @Get('users/:id/followers')
  followers(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.users.followers(
      BigInt(id),
      Number(page ?? 1),
      Number(limit ?? 20),
    );
  }

  @Public()
  @Get('users/:id/following')
  following(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.users.following(
      BigInt(id),
      Number(page ?? 1),
      Number(limit ?? 20),
    );
  }

  @Public()
  @Get('users/:id/friends')
  friendsForUser(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.users.friends(
      BigInt(id),
      Number(page ?? 1),
      Number(limit ?? 20),
    );
  }

  @Get(['users/:id/privileges', 'user/:id/privileges'])
  privileges(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.users.privileges(user.id, BigInt(id));
  }

  // ---- follow / friend / block ----

  @Post(['users/follow', 'user/follow'])
  follow(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.users.follow(
      user.id,
      targetId(body, 'user_id', 'following_id'),
    );
  }

  @Post(['users/unfollow', 'user/unfollow'])
  unfollow(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.users.unfollow(
      user.id,
      targetId(body, 'following_id', 'user_id'),
    );
  }

  @Post(['users/friend-request', 'user/friend-request', 'user/add-friend'])
  async addFriend(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
    @Res({ passthrough: false }) res: FastifyReply,
  ) {
    const result = await this.users.addFriend(
      user.id,
      targetId(body, 'user_id', 'target_id', 'friend_id'),
    );
    const { _raw, ...rest } = result as Record<string, unknown>;
    void _raw;
    return res.send(rest);
  }

  @Post(['user/accept-friend', 'user/friend-request/accept'])
  acceptFriend(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.users.acceptFriend(
      user.id,
      targetId(body, 'user_id', 'friend_id', 'target_id'),
    );
  }

  @Post(['user/reject-friend', 'user/friend-request/decline'])
  rejectFriend(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.users.rejectFriend(
      user.id,
      targetId(body, 'user_id', 'friend_id', 'target_id'),
    );
  }

  @Post('user/cancel-friend-request')
  cancelFriendRequest(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.users.cancelFriendRequest(
      user.id,
      targetId(body, 'user_id', 'friend_id', 'target_id'),
    );
  }

  @Post('user/unfriend')
  unfriend(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.users.unfriend(
      user.id,
      targetId(body, 'friend_id', 'user_id', 'target_id'),
    );
  }

  @Get('user/friend-requests')
  friendRequests(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.users.friendRequests(
      user.id,
      Number(page ?? 1),
      Number(limit ?? 20),
    );
  }

  @Get('user/friend-requests/count')
  friendRequestsCount(@CurrentUser() user: AuthUser) {
    return this.users.friendRequestsCount(user.id);
  }

  @Post('user/block')
  block(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.users.block(
      user.id,
      targetId(body, 'user_id', 'blocked_user_id'),
    );
  }

  @Post('user/unblock')
  unblock(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.users.unblock(
      user.id,
      targetId(body, 'user_id', 'blocked_user_id'),
    );
  }

  @Get('user/blocked-users')
  blockedUsers(@CurrentUser() user: AuthUser) {
    return this.users.blockedUsers(user.id);
  }

  @SkipEmailVerified()
  @Post(['user/device', 'device/register'])
  registerDevice(
    @CurrentUser() user: AuthUser,
    @Body()
    body: { device_id?: string; platform?: string; fcm_token?: string },
  ) {
    return this.users.registerDevice(user.id, body);
  }

  @SkipEmailVerified()
  @Post('update-fcm-token')
  updateFcm(
    @CurrentUser() user: AuthUser,
    @Body() body: { fcm_token: string },
  ) {
    return this.users.updateFcmToken(user.id, body.fcm_token);
  }

  @Post('user/delete')
  deleteAccount(@CurrentUser() user: AuthUser) {
    return this.users.deleteAccount(user.id);
  }
}

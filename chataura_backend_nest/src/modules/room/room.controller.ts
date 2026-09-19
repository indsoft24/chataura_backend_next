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
import { Throttle, seconds } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { RoomGiftingService } from './room-gifting.service';
import { RoomService } from './room.service';

@Controller()
export class RoomController {
  constructor(
    private readonly rooms: RoomService,
    private readonly gifting: RoomGiftingService,
  ) {}

  @Get('rooms')
  list(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sort') sort?: string,
    @Query('country') country?: string,
    @Query('owner_id') ownerId?: string,
    @Query('following') following?: string,
    @Query('friends') friends?: string,
  ) {
    return this.rooms.list({
      page: Number(page ?? 1),
      limit: Number(limit ?? 20),
      sort,
      country,
      owner_id: ownerId,
      following,
      friends,
      viewerId: user.id,
    });
  }

  @Get('rooms/mine')
  mine(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.rooms.mine(user.id, Number(page ?? 1), Number(limit ?? 50));
  }

  @Get('rooms/themes')
  themes() {
    return this.rooms.themes();
  }

  @Get('rooms/:id')
  show(@Param('id') id: string) {
    return this.rooms.show(id);
  }

  @Post('rooms')
  create(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      title: string;
      max_seats?: number;
      settings?: {
        allow_video?: boolean;
        allow_gifts?: boolean;
        allow_games?: boolean;
      };
      cover_image_url?: string;
      description?: string;
      tags?: string[];
      allowed_gender?: string;
      country_code?: string;
      allowed_country?: string;
      min_age?: number;
      max_age?: number;
      theme_id?: number;
    },
  ) {
    return this.rooms.create(user.id, body);
  }

  @Patch('rooms/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.rooms.update(user.id, id, body);
  }

  @Delete('rooms/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rooms.remove(user.id, id);
  }

  @Post('rooms/:id/join')
  join(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rooms.join(user.id, id);
  }

  @Post('rooms/:id/leave')
  leave(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rooms.leave(user.id, id);
  }

  @Throttle({ default: { limit: 240, ttl: seconds(60) } })
  @Post('rooms/:id/heartbeat')
  heartbeat(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rooms.heartbeat(user.id, id);
  }

  @Get('rooms/:id/token')
  token(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('uid') uid?: string,
  ) {
    return this.rooms.token(user.id, id, uid);
  }

  @Get('rooms/:id/users')
  users(@Param('id') id: string) {
    return this.rooms.users(id);
  }

  @Get('rooms/:id/is-blocked')
  isBlocked(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rooms.isBlocked(user.id, id);
  }

  @Get('rooms/:id/blocked-users')
  blockedUsers(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rooms.blockedUsers(user.id, id);
  }

  @Post('rooms/:id/block')
  block(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { user_id: number | string; reason?: string },
  ) {
    return this.rooms.block(user.id, id, BigInt(body.user_id), body.reason);
  }

  @Post('rooms/:id/kick')
  kick(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { user_id: number | string; reason?: string },
  ) {
    return this.rooms.kick(user.id, id, BigInt(body.user_id), body.reason);
  }

  @Post('rooms/:id/unblock')
  unblock(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { user_id: number | string },
  ) {
    return this.rooms.unblock(user.id, id, BigInt(body.user_id));
  }

  @Delete('rooms/:id/block/:userId')
  unblockDelete(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.rooms.unblock(user.id, id, BigInt(userId));
  }

  @Post('rooms/:id/co-host')
  coHost(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body()
    body: { target_uid?: number | string; user_id?: number | string },
  ) {
    return this.rooms.setCoHost(
      user.id,
      id,
      BigInt(String(body.target_uid ?? body.user_id)),
    );
  }

  @Post('rooms/:id/transfer-host')
  transferHost(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body()
    body: {
      target_uid?: number | string;
      new_host_user_id?: number | string;
      user_id?: number | string;
    },
  ) {
    return this.rooms.transferHost(
      user.id,
      id,
      BigInt(String(body.target_uid ?? body.new_host_user_id ?? body.user_id)),
    );
  }

  @Throttle({ default: { limit: 240, ttl: seconds(60) } })
  @Get('rooms/:id/seats')
  seats(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rooms.seats(user.id, id);
  }

  @Post('rooms/:id/seats/:seatIndex/take')
  take(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('seatIndex') seatIndex: string,
  ) {
    return this.rooms.takeSeat(user.id, id, Number(seatIndex));
  }

  @Post('rooms/:id/seats/:seatIndex/assign')
  assign(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('seatIndex') seatIndex: string,
    @Body() body: { user_id: number | string },
  ) {
    return this.rooms.assignSeat(
      user.id,
      id,
      Number(seatIndex),
      BigInt(body.user_id),
    );
  }

  @Post('rooms/:id/seats/leave')
  leaveSeat(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rooms.leaveSeat(user.id, id);
  }

  @Delete('rooms/:id/seats/:seatIndex')
  freeSeat(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('seatIndex') seatIndex: string,
  ) {
    return this.rooms.freeSeat(user.id, id, Number(seatIndex));
  }

  @Patch('rooms/:id/seats/:seatIndex/mute')
  mute(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('seatIndex') seatIndex: string,
    @Body() body: { muted: boolean },
  ) {
    return this.rooms.muteSeat(user.id, id, Number(seatIndex), !!body.muted);
  }

  @Post('rooms/:id/seats/reduce')
  reduce(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rooms.reduceSeats(user.id, id);
  }

  @Get('rooms/:id/gifts/stats')
  giftStats(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.gifting.giftStats(user.id, id);
  }

  @Get('gift-types')
  giftTypes() {
    return this.gifting.giftTypes();
  }

  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @Post('rooms/:id/gifts/send')
  sendGift(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body()
    body: {
      gift_id: number | string;
      receiver_id: number | string;
      quantity?: number;
    },
  ) {
    return this.gifting.sendRoomGift(user.id, id, body);
  }

  @Throttle({ default: { limit: 20, ttl: seconds(60) } })
  @Post('gifts/send-batch')
  sendBatch(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      gift_id: number | string;
      receiver_ids: Array<number | string>;
      quantity?: number;
      room_id: string;
    },
  ) {
    return this.gifting.sendBatchGift(user.id, body);
  }

  @Get('stickers')
  stickers(@CurrentUser() user: AuthUser) {
    return this.rooms.stickers(user.id);
  }

  @Throttle({ default: { limit: 20, ttl: seconds(60) } })
  @Post('stickers/:id/purchase')
  purchaseSticker(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rooms.purchaseSticker(user.id, BigInt(id));
  }

  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @Post('rooms/:id/stickers/send')
  sendSticker(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body()
    body: {
      sticker_id: number | string;
      receiver_id?: number;
      quantity?: number;
    },
  ) {
    return this.rooms.sendSticker(user.id, id, body);
  }
}

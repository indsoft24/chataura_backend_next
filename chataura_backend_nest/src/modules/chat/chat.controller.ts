import {
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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { ChatService } from './chat.service';

@Controller()
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('conversations')
  list(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chat.listConversations(
      user.id,
      Number(page ?? 1),
      Number(limit ?? 20),
    );
  }

  @Get('conversations/with-user/:userId')
  withUser(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    return this.chat.withUser(user.id, BigInt(userId));
  }

  @Post('conversations/:id/read')
  read(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.chat.markRead(user.id, BigInt(id));
  }

  @Post('conversations/read/bulk')
  readBulk(
    @CurrentUser() user: AuthUser,
    @Body() body: { conversation_ids?: Array<number | string> },
  ) {
    return this.chat.markReadBulk(user.id, body);
  }

  @Delete('conversations/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.chat.deleteConversation(user.id, BigInt(id));
  }

  @Get('messages/:conversation_id')
  messages(
    @CurrentUser() user: AuthUser,
    @Param('conversation_id') conversationId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chat.messages(
      user.id,
      BigInt(conversationId),
      Number(page ?? 1),
      Number(limit ?? 50),
    );
  }

  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @Post('messages/send')
  send(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      conversation_id: number | string;
      message_type?: string;
      type?: string;
      message?: string;
      message_text?: string;
      message_media?: string;
      image_url?: string;
      gift_id?: number | string;
      client_uuid?: string;
    },
  ) {
    return this.chat.send(user.id, body);
  }

  @Throttle({ default: { limit: 15, ttl: seconds(60) } })
  @Post('messages/upload-image')
  uploadImage(@Req() req: FastifyRequest) {
    return this.chat.uploadImage(req);
  }

  @Post('messages/status')
  status(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      conversation_id?: number | string;
      message_id?: number | string;
      status?: string;
    },
  ) {
    return this.chat.updateStatus(user.id, body);
  }

  @Delete('messages/:id')
  deleteMessage(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.chat.deleteMessage(user.id, BigInt(id));
  }

  @Get('star-chat/config')
  starConfig() {
    return this.chat.starConfig();
  }

  @Get('conversations/:id/star-chat')
  starPreview(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.chat.starPreview(user.id, BigInt(id));
  }

  @Post('star-chat/sessions')
  startSession(
    @CurrentUser() user: AuthUser,
    @Body() body: { conversation_id: number | string },
  ) {
    return this.chat.startSession(user.id, BigInt(body.conversation_id));
  }

  @Get('star-chat/sessions/active')
  active(@CurrentUser() user: AuthUser) {
    return this.chat.activeSession(user.id);
  }

  @Post('star-chat/sessions/:id/heartbeat')
  heartbeat(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.chat.heartbeat(user.id, BigInt(id));
  }

  @Post('star-chat/sessions/:id/end')
  end(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.chat.endSession(user.id, BigInt(id), 'user');
  }

  @Get('contacts/friends')
  friends(@CurrentUser() user: AuthUser) {
    return this.chat.listFriends(user.id);
  }

  @Get('contacts/groups')
  myGroups(@CurrentUser() user: AuthUser) {
    return this.chat.listGroups(user.id);
  }

  @Post('groups/create')
  createGroup(
    @CurrentUser() user: AuthUser,
    @Body()
    body: { name: string; image?: string; members?: Array<number | string> },
  ) {
    return this.chat.createGroup(user.id, body);
  }

  @Get('groups/:groupId')
  getGroup(@CurrentUser() user: AuthUser, @Param('groupId') groupId: string) {
    return this.chat.getGroup(user.id, BigInt(groupId));
  }

  @Get('groups/:groupId/members')
  groupMembers(
    @CurrentUser() user: AuthUser,
    @Param('groupId') groupId: string,
  ) {
    return this.chat.groupMembers(user.id, BigInt(groupId));
  }

  @Post('groups/:groupId/leave')
  leaveGroup(@CurrentUser() user: AuthUser, @Param('groupId') groupId: string) {
    return this.chat.leaveGroup(user.id, BigInt(groupId));
  }

  @Delete('groups/:groupId')
  deleteGroup(
    @CurrentUser() user: AuthUser,
    @Param('groupId') groupId: string,
  ) {
    return this.chat.deleteGroup(user.id, BigInt(groupId));
  }

  @Post('groups/:groupId/members')
  addMembers(
    @CurrentUser() user: AuthUser,
    @Param('groupId') groupId: string,
    @Body() body: { members: Array<number | string> },
  ) {
    return this.chat.addGroupMembers(user.id, BigInt(groupId), body.members);
  }

  @Delete('groups/:groupId/members')
  removeMember(
    @CurrentUser() user: AuthUser,
    @Param('groupId') groupId: string,
    @Body() body: { user_id: number | string },
  ) {
    return this.chat.removeGroupMember(
      user.id,
      BigInt(groupId),
      BigInt(body.user_id),
    );
  }

  @Patch('groups/:groupId')
  updateGroup(
    @CurrentUser() user: AuthUser,
    @Param('groupId') groupId: string,
    @Body() body: { image_url?: string; name?: string },
  ) {
    return this.chat.updateGroup(user.id, BigInt(groupId), body);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { MediaService } from './media.service';

@Controller()
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get('posts/feed')
  postsFeed(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.media.feed(
      user.id,
      'post',
      Number(page ?? 1),
      Number(limit ?? 20),
    );
  }

  @Get('reels/feed')
  reelsFeed(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.media.feed(
      user.id,
      'reel',
      Number(page ?? 1),
      Number(limit ?? 20),
    );
  }

  @Get('reels/trending')
  trending(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.media.feed(
      user.id,
      'reel',
      Number(page ?? 1),
      Number(limit ?? 20),
      'trending',
    );
  }

  @Get('reels/discover')
  discover(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.media.feed(
      user.id,
      'reel',
      Number(page ?? 1),
      Number(limit ?? 20),
      'discover',
    );
  }

  @Get('posts/:id')
  post(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.media.show(user.id, BigInt(id));
  }

  @Get('reels/:id')
  reel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.media.show(user.id, BigInt(id));
  }

  @Post('posts/upload')
  async uploadPost(
    @CurrentUser() user: AuthUser,
    @Req() req: FastifyRequest,
    @Body()
    body: {
      file_url?: string;
      caption?: string;
      media_type?: string;
    },
  ) {
    const fileUrl = await this.media.storeFromRequest(req, body.file_url);
    return this.media.create(user.id, 'post', { ...body, file_url: fileUrl });
  }

  @Post('reels/upload')
  async uploadReel(
    @CurrentUser() user: AuthUser,
    @Req() req: FastifyRequest,
    @Body()
    body: {
      file_url?: string;
      caption?: string;
      music_url?: string;
      effect_name?: string;
      duration?: number;
      aspect_ratio?: string;
      is_camera_recorded?: boolean;
    },
  ) {
    const fileUrl = await this.media.storeFromRequest(req, body.file_url);
    return this.media.create(user.id, 'reel', {
      ...body,
      file_url: fileUrl,
      media_type: 'video',
    });
  }

  @Post('upload')
  async upload(
    @Req() req: FastifyRequest,
    @Body()
    body: { filename?: string; content_type?: string; file_url?: string },
  ) {
    const stored = await this.media.storeFromRequest(req, body.file_url);
    if (stored) return { url: stored };
    return this.media.signedUpload(body.filename, body.content_type);
  }

  @Post('upload/signed-url')
  signed(@Body() body: { filename?: string; content_type?: string }) {
    return this.media.signedUpload(body.filename, body.content_type);
  }

  @Post('posts/:id/like')
  likePost(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.media.toggleLike(user.id, BigInt(id));
  }

  @Post('reels/:id/like')
  likeReel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.media.toggleLike(user.id, BigInt(id));
  }

  @Post('posts/:id/save')
  savePost(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.media.toggleSave(user.id, BigInt(id));
  }

  @Post('reels/:id/save')
  saveReel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.media.toggleSave(user.id, BigInt(id));
  }

  @Post('posts/:id/share')
  sharePost(@Param('id') id: string) {
    return this.media.share(BigInt(id));
  }

  @Post('reels/:id/share')
  shareReel(@Param('id') id: string) {
    return this.media.share(BigInt(id));
  }

  @Post('posts/:id/comment')
  commentPost(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { comment: string },
  ) {
    return this.media.comment(user.id, BigInt(id), body.comment);
  }

  @Post('reels/:id/comment')
  commentReel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { comment: string },
  ) {
    return this.media.comment(user.id, BigInt(id), body.comment);
  }

  @Get('posts/:id/comments')
  postComments(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.media.comments(
      user.id,
      BigInt(id),
      Number(page ?? 1),
      Number(limit ?? 20),
    );
  }

  @Get('reels/:id/comments')
  reelComments(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.media.comments(
      user.id,
      BigInt(id),
      Number(page ?? 1),
      Number(limit ?? 20),
    );
  }

  @Get('me/posts')
  myPosts(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.media.mine(
      user.id,
      'post',
      Number(page ?? 1),
      Number(limit ?? 20),
    );
  }

  @Get('me/reels')
  myReels(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.media.mine(
      user.id,
      'reel',
      Number(page ?? 1),
      Number(limit ?? 20),
    );
  }

  @Get('me/saved')
  saved(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.media.collection(
      user.id,
      'saved',
      Number(page ?? 1),
      Number(limit ?? 20),
    );
  }

  @Get('me/liked')
  liked(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.media.collection(
      user.id,
      'liked',
      Number(page ?? 1),
      Number(limit ?? 20),
    );
  }

  @Put('posts/:id')
  updatePost(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { caption?: string },
  ) {
    return this.media.update(user.id, BigInt(id), 'post', body);
  }

  @Put('reels/:id')
  updateReel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { caption?: string },
  ) {
    return this.media.update(user.id, BigInt(id), 'reel', body);
  }

  @Delete('posts/:id')
  deletePost(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.media.remove(user.id, BigInt(id), 'post');
  }

  @Post('posts/:id/delete')
  deletePostCompat(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.media.remove(user.id, BigInt(id), 'post');
  }

  @Delete('reels/:id')
  deleteReel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.media.remove(user.id, BigInt(id), 'reel');
  }

  @Post('reels/:id/delete')
  deleteReelCompat(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.media.remove(user.id, BigInt(id), 'reel');
  }

  @Get('banners')
  banners() {
    return this.media.banners();
  }

  @Get('music/library')
  music() {
    return this.media.music(false);
  }

  @Get('music/trending')
  musicTrending() {
    return this.media.music(true);
  }

  @Public()
  @Get('languages')
  languages() {
    return this.media.languages();
  }

  @Public()
  @Get('countries')
  countries() {
    return this.media.countries();
  }

  @Public()
  @Get('faq')
  faq() {
    return this.media.faq();
  }

  @Post('feedback')
  feedback(
    @CurrentUser() user: AuthUser,
    @Body() body: { message?: string; feedback?: string },
  ) {
    return this.media.feedback(user.id, body.message ?? body.feedback ?? '');
  }

}


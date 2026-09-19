import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaKind } from '@prisma/client';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { basename, join, resolve } from 'path';
import { pipeline } from 'stream/promises';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async feed(
    userId: bigint | undefined,
    kind: MediaKind | undefined,
    page = 1,
    limit = 20,
    sort: 'latest' | 'trending' | 'discover' = 'latest',
  ) {
    const take = Math.min(Math.max(limit, 1), 50);
    const skip = (Math.max(page, 1) - 1) * take;
    const where = {
      isDeleted: false,
      ...(kind ? { kind } : {}),
    };
    const orderBy =
      sort === 'trending'
        ? [{ likesCount: 'desc' as const }, { createdAt: 'desc' as const }]
        : sort === 'discover'
          ? [{ viewsCount: 'desc' as const }, { createdAt: 'desc' as const }]
          : [{ createdAt: 'desc' as const }];
    let [rows, total] = await Promise.all([
      this.prisma.mediaItem.findMany({
        where,
        include: { user: true },
        orderBy,
        skip,
        take,
      }),
      this.prisma.mediaItem.count({ where }),
    ]);
    if (kind === 'reel' && total === 0) {
      const fallbackWhere = { isDeleted: false };
      [rows, total] = await Promise.all([
        this.prisma.mediaItem.findMany({
          where: fallbackWhere,
          include: { user: true },
          orderBy,
          skip,
          take,
        }),
        this.prisma.mediaItem.count({ where: fallbackWhere }),
      ]);
    }
    const lastPage = Math.max(1, Math.ceil(total / take));
    const items = await Promise.all(
      rows.map((r) => this.serializePost(r, userId)),
    );
    return {
      success: true,
      data: items,
      current_page: page,
      next_page_url: page < lastPage ? `?page=${page + 1}&limit=${take}` : null,
      has_more: page < lastPage,
      last_page: lastPage,
      per_page: take,
    };
  }

  async userMedia(
    viewerId: bigint | undefined,
    targetUserId: bigint,
    page = 1,
    limit = 20,
  ) {
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!targetUser || targetUser.deletedAt || targetUser.accountStatus === 'deleted') {
      throw new NotFoundException({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });
    }

    if (viewerId && viewerId !== targetUserId) {
      const blocked = await this.prisma.blockedUser.findFirst({
        where: {
          OR: [
            { blockerId: viewerId, blockedId: targetUserId },
            { blockerId: targetUserId, blockedId: viewerId },
          ],
        },
      });
      if (blocked) {
        return {
          success: true,
          data: [],
          current_page: page,
          next_page_url: null,
          has_more: false,
          last_page: 1,
          per_page: limit,
        };
      }

      if (targetUser.isPrivate || targetUser.privateAccount) {
        const isFollower = await this.prisma.userFollower.findFirst({
          where: {
            followerId: viewerId,
            followingId: targetUserId,
            status: 'accepted',
          },
        });
        if (!isFollower) {
          return {
            success: true,
            data: [],
            current_page: page,
            next_page_url: null,
            has_more: false,
            last_page: 1,
            per_page: limit,
          };
        }
      }
    }

    const take = Math.min(Math.max(limit, 1), 50);
    const skip = (Math.max(page, 1) - 1) * take;
    const where = {
      userId: targetUserId,
      isDeleted: false,
    };
    const [rows, total] = await Promise.all([
      this.prisma.mediaItem.findMany({
        where,
        include: { user: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.mediaItem.count({ where }),
    ]);
    const lastPage = Math.max(1, Math.ceil(total / take));
    const items = await Promise.all(
      rows.map((r) => this.serializePost(r, viewerId)),
    );
    return {
      success: true,
      data: items,
      current_page: page,
      next_page_url: page < lastPage ? `?page=${page + 1}&limit=${take}` : null,
      has_more: page < lastPage,
      last_page: lastPage,
      per_page: take,
    };
  }

  async show(userId: bigint | undefined, id: bigint) {
    const row = await this.prisma.mediaItem.findFirst({
      where: { id, isDeleted: false },
      include: { user: true },
    });
    if (!row) {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Media not found' },
      });
    }
    await this.prisma.mediaItem.update({
      where: { id },
      data: { viewsCount: { increment: 1 } },
    });
    return this.serializePost(row, userId);
  }

  async create(
    userId: bigint,
    kind: MediaKind,
    body: {
      file_url?: string;
      caption?: string;
      media_type?: string;
      music_url?: string;
      effect_name?: string;
      duration?: number;
      aspect_ratio?: string;
      is_camera_recorded?: boolean;
      thumbnail_url?: string;
    },
  ) {
    const fileUrl = body.file_url;
    if (!fileUrl) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'FILE_REQUIRED', message: 'file_url is required' },
      });
    }
    const mediaType = body.media_type ?? (kind === 'reel' ? 'video' : 'image');
    const row = await this.prisma.mediaItem.create({
      data: {
        userId,
        kind,
        mediaType,
        fileUrl,
        thumbnailUrl: body.thumbnail_url ?? null,
        caption: body.caption ?? null,
        musicUrl: body.music_url ?? null,
        effectName: body.effect_name ?? null,
        duration: body.duration ?? null,
        aspectRatio: body.aspect_ratio ?? null,
        isCameraRecorded: !!body.is_camera_recorded,
      },
      include: { user: true },
    });
    return {
      id: row.id.toString(),
      file_url: row.fileUrl,
      video_url: kind === 'reel' ? row.fileUrl : null,
      thumbnail_url: row.thumbnailUrl,
      media_type: row.mediaType,
      caption: row.caption,
      music_url: row.musicUrl,
      effect_name: row.effectName,
      duration: row.duration,
      aspect_ratio: row.aspectRatio,
      is_camera_recorded: row.isCameraRecorded,
    };
  }

  async update(
    userId: bigint,
    id: bigint,
    kind: MediaKind,
    body: { caption?: string },
  ) {
    const row = await this.requireOwner(userId, id, kind);
    const updated = await this.prisma.mediaItem.update({
      where: { id: row.id },
      data: { caption: body.caption ?? row.caption },
      include: { user: true },
    });
    if (kind === 'reel') {
      return {
        id: Number(updated.id),
        video_url: updated.fileUrl,
        thumbnail: updated.thumbnailUrl,
        caption: updated.caption ?? '',
        views: updated.viewsCount,
        created_at: updated.createdAt.toISOString(),
        media_post_id: Number(updated.id),
        can_delete: true,
        is_owner: true,
      };
    }
    return {
      id: Number(updated.id),
      media_url: updated.fileUrl,
      thumbnail_url: updated.thumbnailUrl,
      caption: updated.caption ?? '',
      likes_count: updated.likesCount,
      comments_count: updated.commentsCount,
      created_at: updated.createdAt.toISOString(),
      media_post_id: Number(updated.id),
      can_delete: true,
      is_owner: true,
    };
  }

  async remove(userId: bigint, id: bigint, kind: MediaKind) {
    const row = await this.requireOwner(userId, id, kind);
    await this.prisma.mediaItem.update({
      where: { id: row.id },
      data: { isDeleted: true },
    });
    return {
      id: Number(row.id),
      type: kind,
      deleted: true,
      message: 'Deleted',
    };
  }

  async toggleLike(userId: bigint, id: bigint) {
    const media = await this.requireMedia(id);
    const existing = await this.prisma.mediaLike.findUnique({
      where: { mediaId_userId: { mediaId: media.id, userId } },
    });
    if (existing) {
      await this.prisma.mediaLike.delete({ where: { id: existing.id } });
      const likes = await this.bumpCount(media.id, 'likesCount', -1);
      return {
        success: true,
        status: 'unliked',
        is_liked: false,
        isLiked: false,
        liked: false,
        likes,
      };
    }
    await this.prisma.mediaLike.create({
      data: { mediaId: media.id, userId },
    });
    const likes = await this.bumpCount(media.id, 'likesCount', 1);
    return {
      success: true,
      status: 'liked',
      is_liked: true,
      isLiked: true,
      liked: true,
      likes,
    };
  }

  async toggleSave(userId: bigint, id: bigint) {
    const media = await this.requireMedia(id);
    const existing = await this.prisma.mediaSave.findUnique({
      where: { mediaId_userId: { mediaId: media.id, userId } },
    });
    if (existing) {
      await this.prisma.mediaSave.delete({ where: { id: existing.id } });
      return {
        success: true,
        status: 'unsaved',
        is_saved: false,
        isSaved: false,
        saved: false,
      };
    }
    await this.prisma.mediaSave.create({
      data: { mediaId: media.id, userId },
    });
    return {
      success: true,
      status: 'saved',
      is_saved: true,
      isSaved: true,
      saved: true,
    };
  }

  async share(id: bigint) {
    const media = await this.requireMedia(id);
    const shares = await this.bumpCount(media.id, 'sharesCount', 1);
    return { success: true, status: 'shared', shares };
  }

  async comment(userId: bigint, id: bigint, text: string) {
    const media = await this.requireMedia(id);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const row = await this.prisma.mediaComment.create({
      data: { mediaId: media.id, userId, comment: text },
    });
    await this.bumpCount(media.id, 'commentsCount', 1);
    return {
      success: true,
      comment: {
        id: Number(row.id),
        comment: row.comment,
        created_at: row.createdAt.toISOString(),
        user: this.serializeUser(user, false),
      },
    };
  }

  async comments(userId: bigint | undefined, id: bigint, page = 1, limit = 20) {
    await this.requireMedia(id);
    const take = Math.min(Math.max(limit, 1), 50);
    const skip = (Math.max(page, 1) - 1) * take;
    const [rows, total] = await Promise.all([
      this.prisma.mediaComment.findMany({
        where: { mediaId: id },
        include: { user: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.mediaComment.count({ where: { mediaId: id } }),
    ]);
    const lastPage = Math.max(1, Math.ceil(total / take));
    return {
      success: true,
      data: rows.map((c) => ({
        id: Number(c.id),
        comment: c.comment,
        created_at: c.createdAt.toISOString(),
        user: this.serializeUser(c.user, false),
      })),
      current_page: page,
      next_page_url: page < lastPage ? `?page=${page + 1}` : null,
      has_more: page < lastPage,
      last_page: lastPage,
      per_page: take,
    };
  }

  async mine(userId: bigint, kind: MediaKind, page = 1, limit = 20) {
    const take = Math.min(Math.max(limit, 1), 50);
    const skip = (Math.max(page, 1) - 1) * take;
    const where = { userId, kind, isDeleted: false };
    const [rows, total] = await Promise.all([
      this.prisma.mediaItem.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.mediaItem.count({ where }),
    ]);
    const lastPage = Math.max(1, Math.ceil(total / take));
    const data = rows.map((r) =>
      kind === 'reel'
        ? {
            id: Number(r.id),
            video_url: r.fileUrl,
            thumbnail: r.thumbnailUrl,
            caption: r.caption ?? '',
            views: r.viewsCount,
            created_at: r.createdAt.toISOString(),
            media_post_id: Number(r.id),
            can_delete: true,
            is_owner: true,
          }
        : {
            id: Number(r.id),
            media_url: r.fileUrl,
            thumbnail_url: r.thumbnailUrl,
            caption: r.caption ?? '',
            likes_count: r.likesCount,
            comments_count: r.commentsCount,
            created_at: r.createdAt.toISOString(),
            media_post_id: Number(r.id),
            can_delete: true,
            is_owner: true,
          },
    );
    return {
      success: true,
      data,
      meta: {
        total,
        current_page: page,
        last_page: lastPage,
        limit: take,
      },
      current_page: page,
      has_more: page < lastPage,
    };
  }

  async collection(
    userId: bigint,
    type: 'saved' | 'liked',
    page = 1,
    limit = 20,
  ) {
    const take = Math.min(Math.max(limit, 1), 50);
    const skip = (Math.max(page, 1) - 1) * take;
    const rows =
      type === 'saved'
        ? await this.prisma.mediaSave.findMany({
            where: { userId, media: { isDeleted: false } },
            include: { media: { include: { user: true } } },
            orderBy: { createdAt: 'desc' },
            skip,
            take: take + 1,
          })
        : await this.prisma.mediaLike.findMany({
            where: { userId, media: { isDeleted: false } },
            include: { media: { include: { user: true } } },
            orderBy: { createdAt: 'desc' },
            skip,
            take: take + 1,
          });
    const hasMore = rows.length > take;
    const slice = rows.slice(0, take);
    const items = await Promise.all(
      slice.map((r) => this.serializePost(r.media, userId)),
    );
    return {
      success: true,
      data: items,
      current_page: page,
      next_page_url: hasMore ? `?page=${page + 1}` : null,
      has_more: hasMore,
      last_page: hasMore ? page + 1 : page,
      per_page: take,
    };
  }

  signedUpload(filename?: string, contentType?: string) {
    const bucket = this.config.get<string>('GCS_BUCKET') ?? '';
    const name = filename || `media_${Date.now()}`;
    if (!bucket) {
      return {
        url: `https://cdn.chataura.local/uploads/${name}`,
        upload_url: `https://cdn.chataura.local/signed/${name}`,
        content_type: contentType ?? 'application/octet-stream',
        mock: true,
      };
    }
    return {
      url: `https://storage.googleapis.com/${bucket}/${name}`,
      upload_url: `https://storage.googleapis.com/${bucket}/${name}?upload=signed`,
      content_type: contentType ?? 'application/octet-stream',
    };
  }

  async storeLocalFile(
    filename: string,
    stream: NodeJS.ReadableStream,
  ): Promise<string> {
    const dir = resolve(process.cwd(), 'uploads');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const cleanBase = basename(filename || 'upload').replace(
      /[^a-zA-Z0-9._-]/g,
      '_',
    );
    const safe = `${Date.now()}_${cleanBase}`;
    const dest = resolve(dir, safe);
    if (!dest.startsWith(dir)) {
      throw new BadRequestException({
        success: false,
        error: { code: 'INVALID_FILENAME', message: 'Path traversal detected' },
      });
    }
    await pipeline(stream, createWriteStream(dest));
    const publicBase = this.config.get<string>(
      'PUBLIC_BASE_URL',
      'http://localhost:3000',
    );
    return `${publicBase}/uploads/${safe}`;
  }

  /**
   * Attempt to consume a multipart file from the incoming Fastify request.
   * Returns the persisted file URL if a valid file was found, or `fallback` otherwise.
   * Extracted from MediaController.maybeStore() to keep controllers free of
   * stream-processing and MIME validation logic.
   */
  async storeFromRequest(
    req: { file?: () => Promise<any> },
    fallback?: string,
  ): Promise<string | undefined> {
    if (typeof req.file !== 'function') return fallback;
    try {
      const part = await req.file();
      if (!part) return fallback;
      const mime = (part.mimetype || '').toLowerCase();
      const ext = (part.filename || '').split('.').pop()?.toLowerCase();
      const allowedExts = [
        'json',
        'svga',
        'svg',
        'png',
        'jpg',
        'jpeg',
        'gif',
        'webp',
        'mp3',
        'mp4',
        'webm',
        'm4a',
        'aac',
      ];
      const allowed =
        mime.startsWith('image/') ||
        mime.startsWith('video/') ||
        mime.startsWith('audio/') ||
        mime === 'application/json' ||
        mime === 'application/octet-stream' ||
        mime === 'text/plain' ||
        mime.includes('lottie') ||
        mime.includes('svg') ||
        (ext ? allowedExts.includes(ext) : false);
      if (!allowed) return fallback;
      return this.storeLocalFile(part.filename, part.file);
    } catch {
      return fallback;
    }
  }

  banners() {
    return this.prisma.banner
      .findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      })
      .then((rows) => ({
        banners: rows.map((b) => ({
          id: Number(b.id),
          title: b.title,
          subtitle: b.subtitle,
          category: b.category,
          badge_text: b.badgeText,
          image_url: b.imageUrl,
          bg_color_start: b.bgColorStart,
          bg_color_end: b.bgColorEnd,
          button_text: b.buttonText,
          action_type: b.actionType,
          action_target: b.actionTarget,
          details_content: b.detailsContent,
          sort_order: b.sortOrder,
        })),
      }));
  }

  music(trending = false) {
    return this.prisma.musicTrack
      .findMany({
        where: trending ? { isTrending: true } : {},
        orderBy: { id: 'asc' },
      })
      .then((rows) =>
        rows.map((m) => ({
          id: Number(m.id),
          title: m.title,
          artist: m.artist,
          file_url: m.fileUrl,
        })),
      );
  }

  languages() {
    return [
      { code: 'en', name: 'English' },
      { code: 'hi', name: 'Hindi' },
      { code: 'ar', name: 'Arabic' },
    ];
  }

  countries() {
    return [
      { code: 'IN', name: 'India' },
      { code: 'US', name: 'United States' },
      { code: 'AE', name: 'United Arab Emirates' },
    ];
  }

  async faq() {
    const rows = await this.prisma.faqItem.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map((f) => ({
      id: Number(f.id),
      question: f.question,
      answer: f.answer,
    }));
  }

  async feedback(userId: bigint | undefined, message: string) {
    await this.prisma.feedback.create({
      data: { userId: userId ?? null, message },
    });
    return { message: 'Thanks for your feedback' };
  }

  private async requireMedia(id: bigint) {
    const row = await this.prisma.mediaItem.findFirst({
      where: { id, isDeleted: false },
    });
    if (!row) {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Media not found' },
      });
    }
    return row;
  }

  private async requireOwner(userId: bigint, id: bigint, kind: MediaKind) {
    const row = await this.requireMedia(id);
    if (row.kind !== kind || row.userId !== userId) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Not the owner' },
      });
    }
    return row;
  }

  private async bumpCount(
    id: bigint,
    field: 'likesCount' | 'commentsCount' | 'sharesCount',
    delta: number,
  ) {
    const updated = await this.prisma.mediaItem.update({
      where: { id },
      data: { [field]: { increment: delta } },
    });
    return updated[field];
  }

  private async serializePost(
    row: {
      id: bigint;
      userId: bigint;
      kind: MediaKind;
      mediaType: string;
      fileUrl: string;
      thumbnailUrl: string | null;
      caption: string | null;
      musicUrl: string | null;
      effectName: string | null;
      duration: number | null;
      aspectRatio: string | null;
      isCameraRecorded: boolean;
      likesCount: number;
      commentsCount: number;
      sharesCount: number;
      createdAt: Date;
      user: {
        id: bigint;
        name: string | null;
        displayName: string | null;
        avatarUrl: string | null;
      };
    },
    viewerId?: bigint,
  ) {
    let isLiked = false;
    let isSaved = false;
    let isFollowing = false;
    if (viewerId) {
      const [like, save, follow] = await Promise.all([
        this.prisma.mediaLike.findUnique({
          where: { mediaId_userId: { mediaId: row.id, userId: viewerId } },
        }),
        this.prisma.mediaSave.findUnique({
          where: { mediaId_userId: { mediaId: row.id, userId: viewerId } },
        }),
        this.prisma.userFollower.findFirst({
          where: { followerId: viewerId, followingId: row.userId },
        }),
      ]);
      isLiked = !!like;
      isSaved = !!save;
      isFollowing = !!follow;
    }
    const rawFileUrl = row.fileUrl || '';
    const safeFileUrl = rawFileUrl.includes('chataura.local')
      ? (row.mediaType === 'video'
          ? 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
          : 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800')
      : rawFileUrl;
    const safeThumbUrl = row.thumbnailUrl?.includes('chataura.local')
      ? 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400'
      : row.thumbnailUrl;

    return {
      id: row.id.toString(),
      user_id: row.userId.toString(),
      type: row.kind,
      media_type: row.mediaType,
      file_url: safeFileUrl,
      thumbnail_url: safeThumbUrl,
      caption: row.caption,
      music_url: row.musicUrl,
      effect_name: row.effectName,
      duration: row.duration,
      aspect_ratio: row.aspectRatio,
      is_camera_recorded: row.isCameraRecorded,
      likes: row.likesCount,
      comments: row.commentsCount,
      shares: row.sharesCount,
      created_at: row.createdAt.toISOString(),
      is_liked: isLiked,
      is_saved: isSaved,
      media_post_id: Number(row.id),
      can_delete: viewerId === row.userId,
      is_owner: viewerId === row.userId,
      user: this.serializeUser(row.user, isFollowing),
    };
  }

  private serializeUser(
    user: {
      id: bigint;
      name: string | null;
      displayName: string | null;
      avatarUrl: string | null;
    },
    isFollowing: boolean,
  ) {
    const rawAvatar = user.avatarUrl;
    const safeAvatar = rawAvatar?.includes('chataura.local') ? null : rawAvatar;
    return {
      id: Number(user.id),
      name: user.displayName ?? user.name ?? '',
      display_name: user.displayName ?? user.name,
      avatar: safeAvatar,
      avatar_url: safeAvatar,
      is_following: isFollowing,
    };
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { assetPublicBase } from '../../common/gcs/asset-store';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { isAllowedMediaUrl } from '../chat/chat-rules';
import { MediaService } from '../media/media.service';
import { svipLevelOf } from './svip-chrome';
import {
  BACKGROUND_URL_RE,
  MAX_BACKGROUND_BYTES,
  MAX_PROFILE_BACKGROUNDS,
  pickOwnBackgrounds,
} from './svip-backgrounds';
import {
  SVIP_PRIVILEGE_LEVEL,
  assertSvipLevel,
  svipLevelFor,
} from './svip-gates';

const VISITOR_PAGE = 30;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** SVIP functional privileges that need their own endpoints. */
@Injectable()
export class SvipPrivilegesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly config: ConfigService,
  ) {}

  /** Room chat picture: SVIP + active room member. Returns the uploaded URL to post in room chat. */
  async uploadRoomImage(
    userId: bigint,
    roomRef: string,
    req: { file?: () => Promise<any> },
  ) {
    await assertSvipLevel(
      this.prisma,
      userId,
      SVIP_PRIVILEGE_LEVEL,
      'send pictures in rooms',
    );
    // rooms.id is a UUID; anything else can only be the public display id.
    const room = await this.prisma.room.findFirst({
      where: UUID_RE.test(roomRef) ? { id: roomRef } : { displayId: roomRef },
      select: { id: true },
    });
    const member = room
      ? await this.prisma.roomMember.findFirst({
          where: { roomId: room.id, userId, isActive: true },
        })
      : null;
    if (!member) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'NOT_IN_ROOM', message: 'Join the room first' },
      });
    }
    const url = await this.media.storeFromRequest(req, undefined, {
      imagesOnly: true,
    });
    if (!url) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'UPLOAD_FAILED',
          message: 'Send a JPG, PNG, WEBP or GIF picture',
        },
      });
    }
    return { url, image_url: url };
  }

  /**
   * Who viewed my profile. Everyone sees the count (upsell); only SVIP members see the people.
   */
  async visitors(userId: bigint, cursor?: string) {
    const level = await svipLevelFor(this.prisma, userId);
    const total = await this.prisma.userVisit.count({
      where: { targetId: userId },
    });
    if (level < SVIP_PRIVILEGE_LEVEL) {
      return {
        locked: true,
        required_level: SVIP_PRIVILEGE_LEVEL,
        total,
        items: [],
        next_cursor: null,
      };
    }
    const before =
      cursor && !Number.isNaN(Date.parse(cursor))
        ? new Date(cursor)
        : undefined;
    const rows = await this.prisma.userVisit.findMany({
      where: {
        targetId: userId,
        ...(before ? { lastVisitedAt: { lt: before } } : {}),
      },
      include: {
        viewer: {
          select: {
            id: true,
            displayId: true,
            displayName: true,
            name: true,
            avatarUrl: true,
            level: true,
            deletedAt: true,
            svip: true,
          },
        },
      },
      orderBy: { lastVisitedAt: 'desc' },
      take: VISITOR_PAGE + 1,
    });
    const page = rows.slice(0, VISITOR_PAGE);
    return {
      locked: false,
      required_level: SVIP_PRIVILEGE_LEVEL,
      total,
      items: page
        .filter((r) => !r.viewer.deletedAt)
        .map((r) => ({
          user_id: Number(r.viewer.id),
          display_id: r.viewer.displayId,
          name: r.viewer.displayName ?? r.viewer.name,
          avatar_url: r.viewer.avatarUrl,
          level: r.viewer.level,
          svip_level: svipLevelOf(r.viewer.svip),
          visit_count: r.visitCount,
          last_visited_at: r.lastVisitedAt.toISOString(),
        })),
      next_cursor:
        rows.length > VISITOR_PAGE
          ? page[page.length - 1].lastVisitedAt.toISOString()
          : null,
    };
  }

  /** Older apps: one picture already in our storage (clears all with null). Images only, no videos or other files. */
  async setProfileBackground(userId: bigint, url: string | null) {
    await assertSvipLevel(this.prisma, userId, SVIP_PRIVILEGE_LEVEL, 'set a profile background');
    const clean = url?.trim() || null;
    if (clean && (!isAllowedMediaUrl(clean, this.mediaPrefixes()) || !BACKGROUND_URL_RE.test(clean))) {
      throw new BadRequestException({
        success: false,
        error: { code: 'INVALID_MEDIA', message: 'Upload the picture first' },
      });
    }
    await this.saveBackgrounds(userId, clean ? [clean] : []);
    return { profile_bg_url: clean, profile_bg_urls: clean ? [clean] : [] };
  }

  /** Add one picture to my background slider (SVIP, at most 5, images up to 6 MB). */
  async addProfileBackground(userId: bigint, req: { file?: () => Promise<any> }) {
    await assertSvipLevel(this.prisma, userId, SVIP_PRIVILEGE_LEVEL, 'set a profile background');
    const row = await this.prisma.userSvip.findUnique({ where: { userId }, select: { profileBgUrls: true } });
    const list = row?.profileBgUrls ?? [];
    if (list.length >= MAX_PROFILE_BACKGROUNDS) {
      throw new BadRequestException({
        success: false,
        error: { code: 'TOO_MANY', message: `You can add up to ${MAX_PROFILE_BACKGROUNDS} pictures` },
      });
    }
    const url = await this.media.storeFromRequest(req, undefined, { imagesOnly: true, maxBytes: MAX_BACKGROUND_BYTES });
    if (!url || !BACKGROUND_URL_RE.test(url)) {
      throw new BadRequestException({
        success: false,
        error: { code: 'UPLOAD_FAILED', message: 'Send a JPG, PNG or WEBP picture under 6 MB' },
      });
    }
    const next = [...list, url];
    await this.saveBackgrounds(userId, next);
    return { profile_bg_url: next[0], profile_bg_urls: next };
  }

  /** Reorder or remove slides. Only pictures already in my own list are accepted, so no one can point at another file. */
  async setProfileBackgrounds(userId: bigint, urls: unknown) {
    await assertSvipLevel(this.prisma, userId, SVIP_PRIVILEGE_LEVEL, 'set a profile background');
    const row = await this.prisma.userSvip.findUnique({ where: { userId }, select: { profileBgUrls: true } });
    const picked = pickOwnBackgrounds(urls, row?.profileBgUrls ?? []);
    if ('error' in picked) {
      throw new BadRequestException({
        success: false,
        error:
          picked.error === 'BAD_REQUEST'
            ? { code: 'BAD_REQUEST', message: `Send up to ${MAX_PROFILE_BACKGROUNDS} picture links` }
            : { code: 'INVALID_MEDIA', message: 'Upload the picture first' },
      });
    }
    const next = picked.list;
    await this.saveBackgrounds(userId, next);
    return { profile_bg_url: next[0] ?? null, profile_bg_urls: next };
  }

  /** The list and the single legacy url always move together. */
  private async saveBackgrounds(userId: bigint, urls: string[]) {
    await this.prisma.userSvip.update({
      where: { userId },
      data: { profileBgUrls: urls, profileBgUrl: urls[0] ?? null },
    });
  }

  private mediaPrefixes(): string[] {
    const base = this.config
      .get<string>('PUBLIC_BASE_URL', 'http://localhost:3000')
      .replace(/\/+$/, '');
    const bucket = (this.config.get<string>('GCS_BUCKET') ?? '').trim();
    return [
      `${base}/uploads`,
      ...(bucket ? [`https://storage.googleapis.com/${bucket}`] : []),
      ...(assetPublicBase() ? [assetPublicBase()] : []),
    ];
  }
}

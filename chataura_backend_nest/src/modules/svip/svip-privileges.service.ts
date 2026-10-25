import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { isAllowedMediaUrl } from '../chat/chat-rules';
import { MediaService } from '../media/media.service';
import { svipLevelOf } from './svip-chrome';
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

  /** Custom profile background: an image already uploaded to our storage. Null clears it. */
  async setProfileBackground(userId: bigint, url: string | null) {
    await assertSvipLevel(
      this.prisma,
      userId,
      SVIP_PRIVILEGE_LEVEL,
      'set a profile background',
    );
    const clean = url?.trim() || null;
    if (clean && !isAllowedMediaUrl(clean, this.mediaPrefixes())) {
      throw new BadRequestException({
        success: false,
        error: { code: 'INVALID_MEDIA', message: 'Upload the picture first' },
      });
    }
    await this.prisma.userSvip.update({
      where: { userId },
      data: { profileBgUrl: clean },
    });
    return { profile_bg_url: clean };
  }

  private mediaPrefixes(): string[] {
    const base = this.config
      .get<string>('PUBLIC_BASE_URL', 'http://localhost:3000')
      .replace(/\/+$/, '');
    const bucket = (this.config.get<string>('GCS_BUCKET') ?? '').trim();
    return [
      `${base}/uploads`,
      ...(bucket ? [`https://storage.googleapis.com/${bucket}`] : []),
    ];
  }
}

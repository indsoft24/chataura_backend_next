import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RealtimeService } from '../../common/fcm/realtime.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SvipService } from '../svip/svip.service';
import {
  DiceEvent,
  cooldownLeft,
  diceCommand,
  diceEvent,
  refreshError,
  rollDie,
} from './dice.rules';

type Tx = Prisma.TransactionClient;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REFRESH_MESSAGES: Record<string, string> = {
  NOT_YOUR_ROLL: 'You can only re-roll your own dice',
  SVIP_REQUIRED: 'SVIP members can re-roll the dice',
  REFRESH_EXPIRED: 'Too late to re-roll this dice',
  NO_REFRESHES_LEFT: 'No re-rolls left for this dice',
};

function diceError(
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
): never {
  throw new BadRequestException({
    success: false,
    error: { code, message, ...extra },
  });
}

/**
 * Room dice: a seated member rolls, the server picks 1–6 and tells the room through a server-only
 * room event. SVIP members may re-roll the same roll a few times (count per level) within 10 s.
 */
@Injectable()
export class DiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly svip: SvipService,
  ) {}

  async roll(userId: bigint, roomRef: string) {
    const roomId = await this.roomId(roomRef);
    const perks = await this.svip.perksOf(userId);
    const roll = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, userId);
      await this.assertSeated(tx, roomId, userId);
      const now = new Date();
      const last = await tx.diceRoll.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      const wait = cooldownLeft(last?.createdAt ?? null, now);
      if (wait > 0)
        diceError('DICE_COOLDOWN', 'Wait a moment before rolling again', {
          retry_after_ms: wait,
        });
      return tx.diceRoll.create({
        data: {
          roomId,
          userId,
          value: rollDie(),
          svipLevel: perks.level,
          createdAt: now,
          updatedAt: now,
        },
      });
    });
    return this.announce(roomId, diceEvent(roll, perks.diceRefreshes));
  }

  /** Re-roll the same roll (SVIP). The room sees the new value. */
  async refresh(userId: bigint, roomRef: string, rollId: bigint) {
    const roomId = await this.roomId(roomRef);
    const perks = await this.svip.perksOf(userId);
    const roll = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, userId);
      const current = await tx.diceRoll.findUnique({ where: { id: rollId } });
      if (!current || current.roomId !== roomId) {
        throw new NotFoundException({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Dice roll not found' },
        });
      }
      const err = refreshError(
        current,
        userId,
        perks.diceRefreshes,
        new Date(),
      );
      if (err === 'SVIP_REQUIRED') {
        throw new ForbiddenException({
          success: false,
          error: {
            code: err,
            message: REFRESH_MESSAGES[err],
            required_level: 1,
          },
        });
      }
      if (err) diceError(err, REFRESH_MESSAGES[err]);
      await this.assertSeated(tx, roomId, userId);
      return tx.diceRoll.update({
        where: { id: rollId },
        data: { value: rollDie(), refreshCount: { increment: 1 } },
      });
    });
    return this.announce(roomId, diceEvent(roll, perks.diceRefreshes));
  }

  /** Publishes after the commit. `broadcast: false` = Firebase down, only the roller sees it. */
  private async announce(roomId: string, event: DiceEvent) {
    const broadcast = await this.realtime.publishRoomEvent(roomId, {
      text: diceCommand(event),
    });
    return { ...event, broadcast };
  }

  /** On a seat row, or the host shown on seat 0 (rooms list the present host there without a row). */
  private async assertSeated(tx: Tx, roomId: string, userId: bigint) {
    const seat = await tx.seat.findFirst({
      where: { roomId, userId },
      select: { id: true },
    });
    if (!seat && !(await this.isHostOnSeatZero(tx, roomId, userId))) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'NOT_SEATED', message: 'Take a seat to roll the dice' },
      });
    }
  }

  private async isHostOnSeatZero(
    tx: Tx,
    roomId: string,
    userId: bigint,
  ): Promise<boolean> {
    const room = await tx.room.findUnique({
      where: { id: roomId },
      select: { hostId: true, ownerId: true },
    });
    if ((room?.hostId ?? room?.ownerId) !== userId) return false;
    const [present, seatZero] = await Promise.all([
      tx.roomMember.findFirst({
        where: { roomId, userId, isActive: true },
        select: { id: true },
      }),
      tx.seat.findFirst({
        where: { roomId, seatIndex: 0 },
        select: { userId: true },
      }),
    ]);
    return !!present && !seatZero?.userId;
  }

  private async roomId(ref: string): Promise<string> {
    const room = await this.prisma.room.findFirst({
      where: UUID_RE.test(ref) ? { id: ref } : { displayId: ref },
      select: { id: true },
    });
    if (!room)
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Room not found' },
      });
    return room.id;
  }

  private async lock(tx: Tx, userId: bigint) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dice_${userId}`}))`;
  }
}

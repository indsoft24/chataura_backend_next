import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { RealtimeService } from '../../common/fcm/realtime.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  MCHAIR_ENABLED_KEY,
  MCHAIR_IDLE_MS,
  MCHAIR_MIN_SEATED,
  SeatOccupant,
  canRunMusicalChair,
  mchairCommand,
  mchairEvent,
  resolvePausedSeat,
} from './musical-chair.rules';

type Db = Prisma.TransactionClient | PrismaService;
type Session = Prisma.MusicalChairSessionGetPayload<object>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(code: string, message: string, extra: Record<string, unknown> = {}): never {
  throw new BadRequestException({ success: false, error: { code, message, ...extra } });
}

/**
 * Room Musical Chair. The starter (host / co-host / staff admin) is the only one who may play,
 * pause or end the session; the server checks that on every call and tells the room through a
 * server-only room event. The highlight itself runs on each phone from its live seat list.
 */
@Injectable()
export class MusicalChairService {
  private readonly logger = new Logger(MusicalChairService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async enabled(): Promise<boolean> {
    const row = await this.prisma.adminSetting.findUnique({
      where: { id: 1 },
      select: { extraSettings: true },
    });
    const v = (row?.extraSettings as Record<string, unknown> | null)?.[MCHAIR_ENABLED_KEY];
    return v === true || v === 'true' || v === 1 || v === '1';
  }

  async setEnabled(on: boolean, actorId: bigint) {
    const current = await this.prisma.adminSetting.findUnique({ where: { id: 1 } });
    const extra = {
      ...((current?.extraSettings as Record<string, unknown>) ?? {}),
      [MCHAIR_ENABLED_KEY]: on,
    };
    await this.prisma.adminSetting.upsert({
      where: { id: 1 },
      create: { id: 1, extraSettings: extra },
      update: { extraSettings: extra },
    });
    this.logger.log(`Musical Chair ${on ? 'enabled' : 'disabled'} by admin ${actorId}`);
    return { enabled: on };
  }

  async state(roomRef: string) {
    const roomId = await this.roomId(roomRef);
    const [enabled, s] = await Promise.all([
      this.enabled(),
      this.prisma.musicalChairSession.findFirst({ where: { roomId, endedAt: null } }),
    ]);
    return { enabled, session: s ? mchairEvent(s, s.status) : null };
  }

  async start(userId: bigint, roomRef: string) {
    if (!(await this.enabled())) fail('DISABLED', 'Musical Chair is not available yet');
    const roomId = await this.roomId(roomRef);
    const created = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, roomId);
      await this.assertRunner(tx, roomId, userId);
      const running = await tx.musicalChairSession.findFirst({ where: { roomId, endedAt: null } });
      if (running)
        fail('ALREADY_RUNNING', 'Musical Chair is already running in this room', {
          starter_id: Number(running.starterId),
        });
      return tx.musicalChairSession.create({ data: { roomId, starterId: userId } });
    });
    return this.announce(roomId, created, 'started');
  }

  async play(userId: bigint, roomRef: string) {
    const roomId = await this.roomId(roomRef);
    const { session, changed } = await this.prisma.$transaction(async (tx) => {
      const s = await this.ownSession(tx, roomId, userId);
      if (s.status === 'playing') return { session: s, changed: false };
      const seated = await this.occupants(tx, roomId);
      if (seated.length < MCHAIR_MIN_SEATED)
        fail('NEED_SEATED', `Need at least ${MCHAIR_MIN_SEATED} seated members`);
      return { session: await this.touch(tx, s, 'playing', null), changed: true };
    });
    return changed ? this.announce(roomId, session, 'playing') : this.reply(session);
  }

  /** `seat` = the seat highlighted on the starter's phone when they tapped Pause. */
  async pause(userId: bigint, roomRef: string, seat: number) {
    if (!Number.isInteger(seat) || seat < 0 || seat > 99) fail('BAD_SEAT', 'Invalid seat');
    const roomId = await this.roomId(roomRef);
    const { session, changed } = await this.prisma.$transaction(async (tx) => {
      const s = await this.ownSession(tx, roomId, userId);
      if (s.status === 'paused') return { session: s, changed: false };
      const pinned = resolvePausedSeat(seat, await this.occupants(tx, roomId));
      if (!pinned) fail('NEED_SEATED', `Need at least ${MCHAIR_MIN_SEATED} seated members`);
      return { session: await this.touch(tx, s, 'paused', pinned), changed: true };
    });
    return changed ? this.announce(roomId, session, 'paused') : this.reply(session);
  }

  async end(userId: bigint, roomRef: string) {
    const roomId = await this.roomId(roomRef);
    const s = await this.prisma.$transaction(async (tx) => {
      const own = await this.ownSession(tx, roomId, userId, false);
      return this.close(tx, own);
    });
    return this.announce(roomId, s, 'ended');
  }

  /** The starter left the room: end their session (called from RoomService.leave). */
  async endIfStarter(roomId: string, userId: bigint) {
    const s = await this.prisma.musicalChairSession.findFirst({
      where: { roomId, starterId: userId, endedAt: null },
    });
    if (s) await this.endById(s.id);
  }

  /** Ends sessions whose starter is gone, lost the role, or has been idle too long. */
  @Cron('* * * * *')
  async sweep() {
    try {
      const running = await this.prisma.musicalChairSession.findMany({ where: { endedAt: null } });
      const idleBefore = Date.now() - MCHAIR_IDLE_MS;
      for (const s of running) {
        const stale =
          s.lastActionAt.getTime() < idleBefore ||
          !(await this.runnerOk(this.prisma, s.roomId, s.starterId));
        if (stale) await this.endById(s.id);
      }
    } catch (e) {
      this.logger.warn(`sweep failed: ${String(e)}`);
    }
  }

  private async endById(id: bigint) {
    const s = await this.prisma.$transaction(async (tx) => {
      const cur = await tx.musicalChairSession.findUnique({ where: { id } });
      return cur && !cur.endedAt ? this.close(tx, cur) : null;
    });
    if (s) await this.announce(s.roomId, s, 'ended');
  }

  private close(tx: Db, s: Session) {
    return tx.musicalChairSession.update({
      where: { id: s.id },
      data: { endedAt: new Date(), version: { increment: 1 } },
    });
  }

  private touch(tx: Db, s: Session, status: string, pinned: SeatOccupant | null) {
    return tx.musicalChairSession.update({
      where: { id: s.id },
      data: {
        status,
        pausedSeat: pinned?.seat ?? null,
        pausedUserId: pinned?.userId ?? null,
        version: { increment: 1 },
        lastActionAt: new Date(),
      },
    });
  }

  /** The room's running session, locked, and only if `userId` started it and may still run it. */
  private async ownSession(tx: Db, roomId: string, userId: bigint, checkRole = true) {
    await this.lock(tx, roomId);
    const s = await tx.musicalChairSession.findFirst({ where: { roomId, endedAt: null } });
    if (!s)
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_RUNNING', message: 'Musical Chair is not running' },
      });
    if (s.starterId !== userId)
      throw new ForbiddenException({
        success: false,
        error: { code: 'NOT_STARTER', message: 'Only the person who started it can control it' },
      });
    if (checkRole) await this.assertRunner(tx, roomId, userId);
    return s;
  }

  private async assertRunner(tx: Db, roomId: string, userId: bigint) {
    if (!(await this.runnerOk(tx, roomId, userId)))
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'NOT_ALLOWED',
          message: 'Only the host, co-host or room admins can run Musical Chair',
        },
      });
  }

  /** Active in the room and still host / co-host / staff admin. */
  private async runnerOk(db: Db, roomId: string, userId: bigint) {
    const [room, admins, member] = await Promise.all([
      db.room.findUnique({
        where: { id: roomId },
        select: { hostId: true, ownerId: true, coHostId: true },
      }),
      db.roomStaffAdmin.findMany({ where: { roomId }, select: { userId: true } }),
      db.roomMember.findFirst({ where: { roomId, userId, isActive: true }, select: { id: true } }),
    ]);
    if (!room || !member) return false;
    return canRunMusicalChair(userId, {
      hostId: room.hostId ?? room.ownerId,
      coHostId: room.coHostId,
      staffAdminIds: admins.map((a) => a.userId),
    });
  }

  /** Seat rows with a member, plus the present host shown on seat 0 without a row. */
  private async occupants(tx: Db, roomId: string): Promise<SeatOccupant[]> {
    const [seats, room] = await Promise.all([
      tx.seat.findMany({
        where: { roomId, userId: { not: null } },
        select: { seatIndex: true, userId: true },
      }),
      tx.room.findUnique({ where: { id: roomId }, select: { hostId: true, ownerId: true } }),
    ]);
    const out = seats.map((s) => ({ seat: s.seatIndex, userId: s.userId as bigint }));
    const hostId = room?.hostId ?? room?.ownerId;
    if (hostId && !out.some((o) => o.seat === 0 || o.userId === hostId)) {
      const present = await tx.roomMember.findFirst({
        where: { roomId, userId: hostId, isActive: true },
        select: { id: true },
      });
      if (present) out.push({ seat: 0, userId: hostId });
    }
    return out;
  }

  /** Publishes after the commit. `broadcast: false` = Firebase down, only the starter sees it. */
  private async announce(roomId: string, s: Session, state: string) {
    const event = mchairEvent(s, state);
    const broadcast = await this.realtime.publishRoomEvent(roomId, { text: mchairCommand(event) });
    return { ...event, broadcast };
  }

  private reply(s: Session) {
    return { ...mchairEvent(s, s.status), broadcast: true };
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

  private async lock(tx: Db, roomId: string) {
    await (tx as Prisma.TransactionClient).$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`mchair_${roomId}`}))`;
  }
}

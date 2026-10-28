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
import { LedgerService } from '../wallet/ledger.service';
import {
  BATTLE_KEYS,
  BattleSettings,
  Payout,
  Side,
  battleCommand,
  battleEvent,
  battleSettingsForApi,
  canRunBattle,
  readBattleSettings,
  sideOfSeat,
  splitPayout,
  winnerSide,
} from './battle.rules';

type Tx = Prisma.TransactionClient;
type Db = Tx | PrismaService;
type Battle = Prisma.RoomBattleGetPayload<object>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(code: string, message: string, extra: Record<string, unknown> = {}): never {
  throw new BadRequestException({ success: false, error: { code, message, ...extra } });
}

/**
 * Room gifting battle. Seats split into a red (left) and blue (right) team; every gift to a
 * seated member adds to that seat's team inside the gift's own transaction. When time is up the
 * higher total wins: winner_pct is shared evenly by the seated winners, initiator_pct goes to
 * whoever started it. Coins move only through LedgerService with a unique reference per payout.
 *
 * Lock order: gift txs lock users, then the battle row (atomic UPDATE). The finish claim only
 * touches the battle row, and crediting runs in separate per-user txs, so the two never deadlock.
 */
@Injectable()
export class BattleService {
  private readonly logger = new Logger(BattleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly ledger: LedgerService,
  ) {}

  async settings(): Promise<BattleSettings> {
    const row = await this.prisma.adminSetting.findUnique({
      where: { id: 1 },
      select: { extraSettings: true },
    });
    return readBattleSettings(row?.extraSettings as Record<string, unknown> | null);
  }

  /** Superadmin edit. Rejects bad values instead of clamping, so the panel shows what was saved. */
  async updateSettings(patch: Record<string, unknown>, actorId: bigint) {
    const next = { ...battleSettingsForApi(await this.settings()) } as Record<string, unknown>;
    for (const k of Object.values(BATTLE_KEYS)) if (patch[k] !== undefined) next[k] = patch[k];
    const s = readBattleSettings(next);
    const bad =
      (patch[BATTLE_KEYS.winnerPct] !== undefined && s.winnerPct !== Number(patch[BATTLE_KEYS.winnerPct])) ||
      (patch[BATTLE_KEYS.initiatorPct] !== undefined && s.initiatorPct !== Number(patch[BATTLE_KEYS.initiatorPct])) ||
      (patch[BATTLE_KEYS.minMinutes] !== undefined && s.minMinutes !== Number(patch[BATTLE_KEYS.minMinutes])) ||
      (patch[BATTLE_KEYS.maxMinutes] !== undefined && s.maxMinutes !== Number(patch[BATTLE_KEYS.maxMinutes]));
    if (bad) fail('BAD_SETTINGS', 'Percentages must be 0–100 and together at most 100; max time must be ≥ min time');
    const current = await this.prisma.adminSetting.findUnique({ where: { id: 1 } });
    const extra = {
      ...((current?.extraSettings as Record<string, unknown>) ?? {}),
      ...battleSettingsForApi(s),
    };
    await this.prisma.adminSetting.upsert({
      where: { id: 1 },
      create: { id: 1, extraSettings: extra as Prisma.InputJsonValue },
      update: { extraSettings: extra as Prisma.InputJsonValue },
    });
    this.logger.log(`Battle settings changed by admin ${actorId}: ${JSON.stringify(battleSettingsForApi(s))}`);
    return battleSettingsForApi(s);
  }

  async state(roomRef: string) {
    const roomId = await this.roomId(roomRef);
    const [settings, found] = await Promise.all([
      this.settings(),
      this.prisma.roomBattle.findFirst({ where: { roomId, status: 'live' } }),
    ]);
    let live = found;
    // Time is up but the cron has not run yet: close it now so every phone sees the result.
    if (live && live.endsAt.getTime() <= Date.now()) {
      await this.finish(live.id);
      live = null;
    }
    return {
      enabled: settings.enabled,
      winner_pct: settings.winnerPct,
      initiator_pct: settings.initiatorPct,
      min_minutes: settings.minMinutes,
      max_minutes: settings.maxMinutes,
      battle: live ? battleEvent(live, 'score') : null,
    };
  }

  async start(userId: bigint, roomRef: string, minutes: unknown) {
    const settings = await this.settings();
    if (!settings.enabled) fail('DISABLED', 'Battle is not available yet');
    const mins = Number(minutes);
    if (!Number.isInteger(mins) || mins < settings.minMinutes || mins > settings.maxMinutes)
      fail('BAD_DURATION', `Battle time must be ${settings.minMinutes}–${settings.maxMinutes} minutes`);
    const roomId = await this.roomId(roomRef);
    const created = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, roomId);
      if (!(await this.runnerOk(tx, roomId, userId)))
        throw new ForbiddenException({
          success: false,
          error: { code: 'NOT_ALLOWED', message: 'Only the host, co-host or room admins can start a battle' },
        });
      if (await tx.roomBattle.findFirst({ where: { roomId, status: 'live' }, select: { id: true } }))
        fail('ALREADY_RUNNING', 'A battle is already running in this room');
      return tx.roomBattle.create({
        data: {
          roomId,
          initiatorId: userId,
          endsAt: new Date(Date.now() + mins * 60_000),
          winnerPct: settings.winnerPct,
          initiatorPct: settings.initiatorPct,
        },
      });
    });
    return this.announce(roomId, created, 'started');
  }

  /** The initiator, or anyone who may run battles, stops it. No payout. */
  async cancel(userId: bigint, roomRef: string) {
    const roomId = await this.roomId(roomRef);
    const b = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, roomId);
      const live = await tx.roomBattle.findFirst({ where: { roomId, status: 'live' } });
      if (!live)
        throw new NotFoundException({
          success: false,
          error: { code: 'NOT_RUNNING', message: 'No battle is running' },
        });
      if (live.initiatorId !== userId && !(await this.runnerOk(tx, roomId, userId)))
        throw new ForbiddenException({
          success: false,
          error: { code: 'NOT_ALLOWED', message: 'Only the initiator, host, co-host or room admins can cancel' },
        });
      return tx.roomBattle.update({
        where: { id: live.id },
        data: { status: 'cancelled', endedAt: new Date(), version: { increment: 1 } },
      });
    });
    return this.announce(roomId, b, 'cancelled');
  }

  /**
   * Called inside the gift transaction. Adds each gift to the receiver's team if a battle is
   * live; gifts to people not on a seat do not count. Returns true if a score changed.
   */
  async recordGiftTx(
    tx: Tx,
    p: { roomId: string; gifts: { receiverId: bigint; coins: bigint }[] },
  ): Promise<boolean> {
    const live = await tx.roomBattle.findFirst({
      where: { roomId: p.roomId, status: 'live', endsAt: { gt: new Date() } },
      select: { id: true },
    });
    if (!live) return false;
    let changed = false;
    for (const g of p.gifts) {
      const side = await this.sideOfUser(tx, p.roomId, g.receiverId);
      if (!side || g.coins <= 0n) continue;
      const n =
        side === 'red'
          ? await tx.$executeRaw`UPDATE room_battles SET red_total = red_total + ${g.coins}, version = version + 1 WHERE id = ${live.id} AND status = 'live' AND ends_at > now()`
          : await tx.$executeRaw`UPDATE room_battles SET blue_total = blue_total + ${g.coins}, version = version + 1 WHERE id = ${live.id} AND status = 'live' AND ends_at > now()`;
      changed = changed || n > 0;
    }
    return changed;
  }

  /** After the gift commits: tell the room the new totals. */
  async announceScore(roomId: string) {
    const live = await this.prisma.roomBattle.findFirst({ where: { roomId, status: 'live' } });
    if (live) await this.announce(roomId, live, 'score');
  }

  @Cron('* * * * *')
  async sweep() {
    try {
      const due = await this.prisma.roomBattle.findMany({
        where: { status: 'live', endsAt: { lte: new Date() } },
        select: { id: true },
      });
      for (const b of due) await this.finish(b.id);
      // A crash between deciding the winner and crediting leaves unpaid rows: finish them.
      const unpaid = await this.prisma.roomBattle.findMany({
        where: { status: { in: ['won', 'draw'] }, paidAt: null, endedAt: { lt: new Date(Date.now() - 30_000) } },
        select: { id: true },
      });
      for (const b of unpaid) await this.pay(b.id);
    } catch (e) {
      this.logger.warn(`sweep failed: ${String(e)}`);
    }
  }

  /** Decide the winner and write the payout rows (one short tx), then credit them. */
  async finish(id: bigint) {
    const decided = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: bigint }[]>`
        SELECT id FROM room_battles WHERE id = ${id} AND status = 'live' AND ends_at <= now() FOR UPDATE`;
      if (locked.length === 0) return null;
      const b = await tx.roomBattle.findUniqueOrThrow({ where: { id } });
      const side = winnerSide(b.redTotal, b.blueTotal);
      const winnerIds = side ? await this.seatedOnSide(tx, b.roomId, side) : [];
      const payouts = splitPayout({
        red: b.redTotal,
        blue: b.blueTotal,
        winnerPct: b.winnerPct,
        initiatorPct: b.initiatorPct,
        initiatorId: b.initiatorId,
        winnerIds,
      });
      if (payouts.length)
        await tx.battlePayout.createMany({
          data: payouts.map((p) => ({ battleId: id, userId: p.userId, role: p.role, amount: p.amount })),
        });
      const done = await tx.roomBattle.update({
        where: { id },
        data: {
          status: side ? 'won' : 'draw',
          winnerSide: side,
          endedAt: new Date(),
          version: { increment: 1 },
          paidAt: payouts.length ? null : new Date(),
        },
      });
      return { done, payouts };
    });
    if (!decided) return;
    await this.pay(id);
    await this.announce(decided.done.roomId, decided.done, 'ended', decided.payouts);
  }

  /** Credits every payout row once; safe to repeat (unique ledger reference per payout). */
  private async pay(id: bigint) {
    const b = await this.prisma.roomBattle.findUnique({ where: { id }, include: { payouts: true } });
    if (!b || b.paidAt) return;
    for (const p of b.payouts) {
      await this.prisma.$transaction(async (tx) => {
        await this.ledger.creditCoins(
          tx,
          p.userId,
          p.amount,
          'BATTLE_REWARD',
          p.role === 'initiator' ? 'Battle initiator reward' : 'Battle winner reward',
          `battle:${id}:${p.userId}:${p.role}`,
          null,
          { source: 'battle', battle_id: Number(id), role: p.role, room_id: b.roomId },
        );
      });
    }
    await this.prisma.roomBattle.update({ where: { id }, data: { paidAt: new Date() } });
  }

  /** Team of a seated member; the present host shown on an empty seat 0 counts as seat 0. */
  private async sideOfUser(tx: Tx, roomId: string, userId: bigint): Promise<Side | null> {
    const seat = await tx.seat.findFirst({ where: { roomId, userId }, select: { seatIndex: true } });
    if (seat) return sideOfSeat(seat.seatIndex);
    return (await this.hostOnSeatZero(tx, roomId, userId)) ? sideOfSeat(0) : null;
  }

  private async hostOnSeatZero(tx: Tx, roomId: string, userId: bigint) {
    const room = await tx.room.findUnique({ where: { id: roomId }, select: { hostId: true, ownerId: true } });
    if ((room?.hostId ?? room?.ownerId) !== userId) return false;
    const [present, seatZero] = await Promise.all([
      tx.roomMember.findFirst({ where: { roomId, userId, isActive: true }, select: { id: true } }),
      tx.seat.findFirst({ where: { roomId, seatIndex: 0 }, select: { userId: true } }),
    ]);
    return !!present && !seatZero?.userId;
  }

  private async seatedOnSide(tx: Tx, roomId: string, side: Side): Promise<bigint[]> {
    const seats = await tx.seat.findMany({
      where: { roomId, userId: { not: null } },
      select: { seatIndex: true, userId: true },
    });
    const ids = new Set(
      seats.filter((s) => sideOfSeat(s.seatIndex) === side).map((s) => s.userId as bigint),
    );
    const room = await tx.room.findUnique({ where: { id: roomId }, select: { hostId: true, ownerId: true } });
    const hostId = room?.hostId ?? room?.ownerId;
    if (hostId && (await this.hostOnSeatZero(tx, roomId, hostId)) && sideOfSeat(0) === side) ids.add(hostId);
    return [...ids];
  }

  private async runnerOk(db: Db, roomId: string, userId: bigint) {
    const [room, admins, member] = await Promise.all([
      db.room.findUnique({ where: { id: roomId }, select: { hostId: true, ownerId: true, coHostId: true } }),
      db.roomStaffAdmin.findMany({ where: { roomId }, select: { userId: true } }),
      db.roomMember.findFirst({ where: { roomId, userId, isActive: true }, select: { id: true } }),
    ]);
    if (!room || !member) return false;
    return canRunBattle(userId, {
      hostId: room.hostId ?? room.ownerId,
      coHostId: room.coHostId,
      staffAdminIds: admins.map((a) => a.userId),
    });
  }

  /** Publishes after the commit. `broadcast: false` = Firebase down, only the caller sees it. */
  private async announce(roomId: string, b: Battle, state: string, payouts: Payout[] = []) {
    const event = battleEvent(b, state, payouts);
    const broadcast = await this.realtime.publishRoomEvent(roomId, { text: battleCommand(event) });
    return { ...event, broadcast };
  }

  private async roomId(ref: string): Promise<string> {
    const room = await this.prisma.room.findFirst({
      where: UUID_RE.test(ref) ? { id: ref } : { displayId: ref },
      select: { id: true },
    });
    if (!room)
      throw new NotFoundException({ success: false, error: { code: 'NOT_FOUND', message: 'Room not found' } });
    return room.id;
  }

  private async lock(tx: Tx, roomId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`battle_${roomId}`}))`;
  }
}

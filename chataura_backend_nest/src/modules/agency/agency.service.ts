import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AgencyAffiliationStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LedgerService } from '../wallet/ledger.service';

const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AgencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  async me(userId: bigint) {
    const active = await this.prisma.agencyAffiliation.findFirst({
      where: { roomOwnerId: userId, status: 'accepted' },
      include: { agency: true, room: true },
      orderBy: { id: 'desc' },
    });
    const pending = await this.prisma.agencyAffiliation.findFirst({
      where: { roomOwnerId: userId, status: 'pending' },
      include: { agency: true, room: true },
      orderBy: { id: 'desc' },
    });
    const lastLeft = await this.prisma.agencyAffiliation.findFirst({
      where: { roomOwnerId: userId, cooldownUntil: { gt: new Date() } },
      orderBy: { cooldownUntil: 'desc' },
    });
    return {
      active: active ? this.serializeAff(active) : null,
      pending: pending ? this.serializeAff(pending) : null,
      cooldown_until: lastLeft?.cooldownUntil?.toISOString() ?? null,
      linked_room_id: active?.roomId ?? null,
      linked_room: active?.room ? this.serializeRoom(active.room) : null,
      is_permanent: active?.room?.isPermanent ?? null,
    };
  }

  async join(
    userId: bigint,
    body: { agency_user_id: number | string; room_id?: string },
  ) {
    const agencyUserId = BigInt(body.agency_user_id);
    const agency = await this.prisma.user.findUnique({
      where: { id: agencyUserId },
    });
    if (!agency || (agency.role !== 'agency' && agency.role !== 'admin')) {
      throw new BadRequestException({
        success: false,
        error: { code: 'NOT_AGENCY', message: 'Target is not an agency' },
      });
    }
    const cooldown = await this.prisma.agencyAffiliation.findFirst({
      where: { roomOwnerId: userId, cooldownUntil: { gt: new Date() } },
    });
    if (cooldown) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'COOLDOWN',
          message: 'You recently left an agency',
        },
      });
    }
    const existing = await this.prisma.agencyAffiliation.findFirst({
      where: {
        roomOwnerId: userId,
        status: { in: ['pending', 'accepted'] },
      },
    });
    if (existing) {
      throw new BadRequestException({
        success: false,
        error: { code: 'ALREADY_LINKED', message: 'Already affiliated' },
      });
    }
    const row = await this.prisma.agencyAffiliation.create({
      data: {
        agencyUserId,
        roomOwnerId: userId,
        roomId: body.room_id ?? null,
        status: 'pending',
      },
      include: { agency: true, roomOwner: true, room: true },
    });
    return this.serializeAff(row);
  }

  async leave(userId: bigint) {
    const row = await this.prisma.agencyAffiliation.findFirst({
      where: {
        roomOwnerId: userId,
        status: { in: ['pending', 'accepted'] },
      },
      include: { agency: true, roomOwner: true, room: true },
    });
    if (!row) {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: 'No active affiliation' },
      });
    }
    const until = new Date(Date.now() + COOLDOWN_MS);
    const updated = await this.prisma.agencyAffiliation.update({
      where: { id: row.id },
      data: {
        status: 'left',
        leftAt: new Date(),
        cooldownUntil: until,
      },
      include: { agency: true, roomOwner: true, room: true },
    });
    if (updated.roomId) {
      await this.prisma.room.update({
        where: { id: updated.roomId },
        data: { isPermanent: false },
      });
    }
    return {
      affiliation: this.serializeAff(updated),
      cooldown_until: until.toISOString(),
    };
  }

  async requests(userId: bigint) {
    await this.assertAgency(userId);
    const rows = await this.prisma.agencyAffiliation.findMany({
      where: { agencyUserId: userId, status: 'pending' },
      include: { agency: true, roomOwner: true, room: true },
      orderBy: { id: 'desc' },
    });
    return { requests: rows.map((r) => this.serializeAff(r)) };
  }

  async accept(userId: bigint, id: bigint, body?: { room_id?: string }) {
    const row = await this.requireAgencyRequest(userId, id);
    const roomId = body?.room_id ?? row.roomId;
    const updated = await this.prisma.agencyAffiliation.update({
      where: { id: row.id },
      data: {
        status: 'accepted',
        joinedAt: new Date(),
        roomId,
      },
      include: { agency: true, roomOwner: true, room: true },
    });
    if (roomId) {
      await this.prisma.room.update({
        where: { id: roomId },
        data: { isPermanent: true },
      });
    }
    return this.serializeAff(updated);
  }

  async reject(userId: bigint, id: bigint) {
    const row = await this.requireAgencyRequest(userId, id);
    await this.prisma.agencyAffiliation.update({
      where: { id: row.id },
      data: { status: 'rejected' },
    });
    return { message: 'Rejected' };
  }

  async members(userId: bigint) {
    await this.assertAgency(userId);
    const rows = await this.prisma.agencyAffiliation.findMany({
      where: { agencyUserId: userId, status: 'accepted' },
      include: { roomOwner: true, room: true },
      orderBy: { joinedAt: 'desc' },
    });
    return {
      members: await Promise.all(rows.map((r) => this.serializeMember(r))),
    };
  }

  async memberDetail(actorId: bigint, ownerId: bigint) {
    await this.assertAgency(actorId);
    const row = await this.prisma.agencyAffiliation.findFirst({
      where: {
        agencyUserId: actorId,
        roomOwnerId: ownerId,
        status: 'accepted',
      },
      include: { roomOwner: true, room: true },
    });
    if (!row) {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Member not found' },
      });
    }
    const rooms = await this.prisma.room.findMany({
      where: { ownerId, isLive: true },
    });
    return {
      ...(await this.serializeMember(row)),
      rooms: rooms.map((r) => this.serializeRoomSummary(r, true)),
      metrics: {
        gems: Number(row.roomOwner.gems),
        rooms: rooms.length,
      },
    };
  }

  async analytics(userId: bigint) {
    await this.assertAgency(userId);
    const members = await this.prisma.agencyAffiliation.findMany({
      where: { agencyUserId: userId, status: 'accepted' },
      include: { room: true },
    });
    const rooms = members
      .map((m) => m.room)
      .filter((r): r is NonNullable<typeof r> => !!r);
    return {
      member_count: members.length,
      room_count: rooms.length,
      rooms: rooms.map((r) => this.serializeRoomSummary(r, true)),
      metrics: { affiliations: members.length },
    };
  }

  async weekly(userId: bigint, periodId?: bigint) {
    await this.assertAgency(userId);
    const { start, end, id } = this.currentPeriod(periodId);
    await this.ensureWeeklyRows(userId, id, start, end);
    const rows = await this.prisma.agencyWeeklyDistribution.findMany({
      where: { agencyUserId: userId, periodId: id },
      include: { roomOwner: true },
      orderBy: { id: 'asc' },
    });
    return {
      distributions: rows.map((r) => ({
        id: Number(r.id),
        period_id: Number(r.periodId),
        week_start: r.weekStart.toISOString().slice(0, 10),
        week_end: r.weekEnd.toISOString().slice(0, 10),
        room_owner_id: Number(r.roomOwnerId),
        room_owner_name: r.roomOwner.displayName ?? r.roomOwner.name,
        suggested_gems: r.suggestedGems,
        approved_gems: r.approvedGems,
        status: r.status,
        notes: r.notes,
      })),
    };
  }

  async weeklyApprove(
    userId: bigint,
    id: bigint,
    body: { approved_gems: number; notes?: string },
  ) {
    await this.assertAgency(userId);
    const gems = Math.max(0, Number(body.approved_gems));

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.agencyWeeklyDistribution.findUnique({
        where: { id },
      });
      if (!row || row.agencyUserId !== userId) {
        throw new NotFoundException({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Distribution not found' },
        });
      }
      if (row.status !== 'pending') {
        throw new BadRequestException({
          success: false,
          error: { code: 'ALREADY_SETTLED', message: 'Already processed' },
        });
      }

      // Optimistically claim status transition
      const claimed = await tx.agencyWeeklyDistribution.updateMany({
        where: { id, agencyUserId: userId, status: 'pending' },
        data: {
          status: 'paid',
          approvedGems: gems,
          notes: body.notes ?? null,
          paidAt: new Date(),
        },
      });
      if (claimed.count === 0) {
        throw new BadRequestException({
          success: false,
          error: { code: 'ALREADY_SETTLED', message: 'Already processed' },
        });
      }

      const locked = await this.ledger.lockUser(tx, row.roomOwnerId);
      if (!locked) {
        throw new NotFoundException({
          success: false,
          error: { code: 'USER_NOT_FOUND', message: 'Room owner not found' },
        });
      }

      await tx.user.update({
        where: { id: row.roomOwnerId },
        data: {
          gems: { increment: gems },
          totalEarnedCoins: { increment: gems },
        },
      });

      await this.ledger.writeLedger(tx, {
        userId: row.roomOwnerId,
        type: 'AGENCY_WEEKLY_PAYOUT',
        title: `Agency distribution #${id}`,
        coinAmount: 0,
        netAmount: BigInt(gems),
        referenceId: `agency_dist_${id}`,
        status: 'success',
        meta: {
          distribution_id: Number(id),
          agency_user_id: Number(userId),
          approved_gems: gems,
          notes: body.notes ?? null,
        },
      });

      return tx.agencyWeeklyDistribution.findUniqueOrThrow({
        where: { id },
      });
    });

    return {
      id: Number(updated.id),
      status: updated.status,
      approved_gems: updated.approvedGems,
      paid_at: updated.paidAt?.toISOString() ?? null,
    };
  }

  async weeklyReject(userId: bigint, id: bigint, body?: { notes?: string }) {
    await this.assertAgency(userId);
    const row = await this.prisma.agencyWeeklyDistribution.findUnique({
      where: { id },
    });
    if (!row || row.agencyUserId !== userId) {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Distribution not found' },
      });
    }
    if (row.status !== 'pending') {
      throw new BadRequestException({
        success: false,
        error: { code: 'ALREADY_SETTLED', message: 'Already processed' },
      });
    }
    const claimed = await this.prisma.agencyWeeklyDistribution.updateMany({
      where: { id, agencyUserId: userId, status: 'pending' },
      data: {
        status: 'rejected',
        notes: body?.notes ?? null,
        paidAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      throw new BadRequestException({
        success: false,
        error: { code: 'ALREADY_SETTLED', message: 'Already processed' },
      });
    }
    const fresh = await this.prisma.agencyWeeklyDistribution.findUniqueOrThrow({
      where: { id },
    });
    return {
      id: Number(fresh.id),
      status: fresh.status,
      approved_gems: fresh.approvedGems,
      paid_at: fresh.paidAt?.toISOString() ?? null,
    };
  }

  private async ensureWeeklyRows(
    agencyUserId: bigint,
    periodId: bigint,
    start: Date,
    end: Date,
  ) {
    const members = await this.prisma.agencyAffiliation.findMany({
      where: { agencyUserId, status: 'accepted' },
      include: { roomOwner: true },
    });
    for (const m of members) {
      await this.prisma.agencyWeeklyDistribution.upsert({
        where: {
          periodId_agencyUserId_roomOwnerId: {
            periodId,
            agencyUserId,
            roomOwnerId: m.roomOwnerId,
          },
        },
        create: {
          periodId,
          weekStart: start,
          weekEnd: end,
          agencyUserId,
          roomOwnerId: m.roomOwnerId,
          suggestedGems: Math.min(Number(m.roomOwner.gems), 500),
        },
        update: {},
      });
    }
  }

  private currentPeriod(periodId?: bigint) {
    const now = new Date();
    const day = now.getUTCDay() || 7;
    const start = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - day + 1,
      ),
    );
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    const id =
      periodId ??
      BigInt(
        start.getUTCFullYear() * 100 +
          Math.ceil(
            ((start.getTime() - Date.UTC(start.getUTCFullYear(), 0, 1)) /
              86400000 +
              1) /
              7,
          ),
      );
    return { start, end, id };
  }

  private async assertAgency(userId: bigint) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (user.role !== 'agency' && user.role !== 'admin') {
      throw new ForbiddenException({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Agency only' },
      });
    }
    return user;
  }

  private async requireAgencyRequest(userId: bigint, id: bigint) {
    await this.assertAgency(userId);
    const row = await this.prisma.agencyAffiliation.findUnique({
      where: { id },
    });
    if (!row || row.agencyUserId !== userId || row.status !== 'pending') {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Request not found' },
      });
    }
    return row;
  }

  private serializeAff(row: {
    id: bigint;
    status: AgencyAffiliationStatus;
    roomOwnerId: bigint;
    agencyUserId: bigint;
    joinedAt: Date | null;
    leftAt: Date | null;
    cooldownUntil: Date | null;
    roomId: string | null;
    agency?: {
      id: bigint;
      displayName: string | null;
      name: string | null;
      avatarUrl: string | null;
      country: string | null;
      role: string;
    };
    roomOwner?: {
      id: bigint;
      displayName: string | null;
      name: string | null;
      avatarUrl: string | null;
      country: string | null;
      role: string;
    };
    room?: {
      id: string;
      title: string;
      displayId: string;
      isPermanent: boolean;
    } | null;
  }) {
    return {
      id: Number(row.id),
      status: row.status,
      room_owner_id: Number(row.roomOwnerId),
      agency_user_id: Number(row.agencyUserId),
      joined_at: row.joinedAt?.toISOString() ?? null,
      left_at: row.leftAt?.toISOString() ?? null,
      cooldown_until: row.cooldownUntil?.toISOString() ?? null,
      agency: row.agency ? this.userSummary(row.agency) : null,
      room_owner: row.roomOwner ? this.userSummary(row.roomOwner) : null,
      linked_room_id: row.roomId,
      linked_room: row.room ? this.serializeRoom(row.room) : null,
      is_permanent: row.room?.isPermanent ?? false,
    };
  }

  private async serializeMember(row: {
    id: bigint;
    joinedAt: Date | null;
    roomId: string | null;
    roomOwner: {
      id: bigint;
      displayName: string | null;
      name: string | null;
      avatarUrl: string | null;
      country: string | null;
      role: string;
    };
    room: {
      id: string;
      title: string;
      displayId: string;
      ownerId: bigint;
      hostId: bigint | null;
      isLive: boolean;
      isPermanent: boolean;
    } | null;
  }) {
    return {
      affiliation_id: Number(row.id),
      joined_at: row.joinedAt?.toISOString() ?? null,
      owner: this.userSummary(row.roomOwner),
      rooms: row.room ? [this.serializeRoomSummary(row.room, true)] : [],
      linked_room_id: row.roomId,
      linked_room: row.room ? this.serializeRoom(row.room) : null,
      is_permanent: row.room?.isPermanent ?? false,
    };
  }

  private serializeRoom(room: {
    id: string;
    title: string;
    displayId: string;
    isPermanent: boolean;
  }) {
    return {
      id: room.id,
      title: room.title,
      display_id: room.displayId,
      is_permanent: room.isPermanent,
    };
  }

  private serializeRoomSummary(
    room: {
      id: string;
      title: string;
      displayId: string;
      ownerId?: bigint;
      hostId?: bigint | null;
      isLive?: boolean;
      isPermanent: boolean;
    },
    linked: boolean,
  ) {
    return {
      id: room.id,
      title: room.title,
      display_id: room.displayId,
      owner_id: room.ownerId ? Number(room.ownerId) : null,
      host_id: room.hostId ? Number(room.hostId) : null,
      status: room.isLive === false ? 'ended' : 'live',
      is_active: room.isLive !== false,
      is_agency_linked: linked,
      is_permanent: room.isPermanent,
    };
  }

  private userSummary(u: {
    id: bigint;
    displayName: string | null;
    name: string | null;
    avatarUrl: string | null;
    country: string | null;
    role: string;
  }) {
    return {
      id: Number(u.id),
      name: u.displayName ?? u.name,
      avatar_url: u.avatarUrl,
      country: u.country,
      role_badge: {
        type: u.role === 'agency' ? 'agency' : u.role,
        label: u.role === 'agency' ? 'Agency' : u.role,
      },
    };
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LedgerService } from '../wallet/ledger.service';
import { RoomEvents } from './room.events';

@Injectable()
export class RoomGiftingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly events: RoomEvents,
  ) {}

  async giftTypes() {
    const gifts = await this.prisma.gift.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    });
    return gifts.map((g) => ({
      id: Number(g.id),
      name: g.name,
      coin_cost: g.coinCost,
      coin_price: g.coinCost,
      image_url: g.imageUrl,
      animation_url: g.animationUrl,
    }));
  }

  async sendRoomGift(
    senderId: bigint,
    id: string,
    body: {
      gift_id: number | string;
      receiver_id: number | string;
      quantity?: number;
    },
  ) {
    const room = await this.findRoom(id);
    const quantity = Math.min(Math.max(Number(body.quantity ?? 1), 1), 100);
    const gift = await this.prisma.gift.findFirst({
      where: { id: BigInt(body.gift_id), isActive: true },
    });
    if (!gift) {
      throw new NotFoundException({
        success: false,
        error: { code: 'GIFT_NOT_FOUND', message: 'Gift not found' },
      });
    }
    const receiverId = BigInt(body.receiver_id);
    await this.requireActiveMember(room.id, senderId);
    const recvMember = await this.prisma.roomMember.findFirst({
      where: { roomId: room.id, userId: receiverId, isActive: true },
    });
    const seated = await this.prisma.seat.findFirst({
      where: { roomId: room.id, userId: receiverId },
    });
    if (
      !recvMember &&
      !seated &&
      room.hostId !== receiverId &&
      room.ownerId !== receiverId
    ) {
      throw new BadRequestException({
        success: false,
        error: { code: 'NOT_IN_ROOM', message: 'Receiver is not in this room' },
      });
    }
    const settings = await this.prisma.adminSetting.findUnique({
      where: { id: 1 },
    });
    const commissionPct = Number(settings?.giftCommissionPct ?? 20) / 100;
    const cost = BigInt(gift.coinCost * quantity);
    const commission = BigInt(Math.floor(Number(cost) * commissionPct));
    const netGems = cost - commission;

    const result = await this.prisma.$transaction(async (tx) => {
      try {
        const userMap = await this.ledger.lockUsers(tx, [senderId, receiverId]);
        const recv = userMap.get(receiverId.toString());
        const senderLocked = userMap.get(senderId.toString());
        if (!recv || !senderLocked) {
          throw new NotFoundException({
            success: false,
            error: {
              code: 'RECEIVER_NOT_FOUND',
              message: 'Receiver not found',
            },
          });
        }
        const ref = `room_${room.id}_gift_${gift.id}_${senderId}_${Date.now()}`;
        const { after } = await this.ledger.debitCoins(
          tx,
          senderId,
          cost,
          'GIFT',
          `Room gift: ${gift.name}`,
          ref,
          senderLocked,
          {
            room_id: room.id,
            gift_id: Number(gift.id),
            receiver_id: Number(receiverId),
            quantity,
          },
        );
        await tx.user.update({
          where: { id: receiverId },
          data: {
            gems: { increment: netGems },
            totalEarnedCoins: { increment: netGems },
          },
        });
        return {
          transaction_id: `RG_${Date.now()}`,
          coin_amount: Number(cost),
          commission_amount: Number(commission),
          net_amount: Number(netGems),
          sender_balance_after: Number(after),
          receiver_gems_after: Number(recv.gems + netGems),
          balances: {
            coins: Number(after),
            gems: Number(senderLocked.gems),
            referral_balance: Number(senderLocked.referral_balance),
          },
          agency_cashback: null,
        };
      } catch (e) {
        if ((e as { code?: string }).code === 'INSUFFICIENT_BALANCE') {
          throw new BadRequestException({
            success: false,
            error: {
              code: 'INSUFFICIENT_BALANCE',
              message: 'Insufficient coin balance',
            },
          });
        }
        if ((e as { code?: string }).code === 'USER_NOT_FOUND') {
          throw new NotFoundException({
            success: false,
            error: {
              code: 'RECEIVER_NOT_FOUND',
              message: 'Receiver not found',
            },
          });
        }
        throw e;
      }
    });
    this.events.emitGiftOverlay(room.id, {
      gift_id: Number(gift.id),
      image_url: gift.imageUrl,
      animation_url: gift.animationUrl,
      sender_id: Number(senderId),
      receiver_id: Number(receiverId),
      quantity,
    });
    return result;
  }

  async sendBatchGift(
    senderId: bigint,
    body: {
      gift_id: number | string;
      receiver_ids: Array<number | string>;
      quantity?: number;
      room_id: string;
    },
  ) {
    const rawIds = (body.receiver_ids ?? []).map((id) => BigInt(id));
    const receiverIds = Array.from(new Set(rawIds));
    if (receiverIds.length === 0) {
      return {
        transaction_ids: [],
        coin_amount: 0,
        per_receiver_coin_amount: 0,
        receiver_count: 0,
        sender_balance_after: 0,
        agency_cashback: null,
      };
    }

    const room = await this.findRoom(body.room_id);
    const quantity = Math.min(Math.max(Number(body.quantity ?? 1), 1), 100);
    const gift = await this.prisma.gift.findFirst({
      where: { id: BigInt(body.gift_id), isActive: true },
    });
    if (!gift) {
      throw new NotFoundException({
        success: false,
        error: { code: 'GIFT_NOT_FOUND', message: 'Gift not found' },
      });
    }

    await this.requireActiveMember(room.id, senderId);

    for (const rid of receiverIds) {
      const recvMember = await this.prisma.roomMember.findFirst({
        where: { roomId: room.id, userId: rid, isActive: true },
      });
      const seated = await this.prisma.seat.findFirst({
        where: { roomId: room.id, userId: rid },
      });
      if (
        !recvMember &&
        !seated &&
        room.hostId !== rid &&
        room.ownerId !== rid
      ) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'NOT_IN_ROOM',
            message: `Receiver ${rid} is not in this room`,
          },
        });
      }
    }

    const settings = await this.prisma.adminSetting.findUnique({
      where: { id: 1 },
    });
    const commissionPct = Number(settings?.giftCommissionPct ?? 20) / 100;
    const perCost = BigInt(gift.coinCost * quantity);
    const totalCost = perCost * BigInt(receiverIds.length);
    const perCommission = BigInt(Math.floor(Number(perCost) * commissionPct));
    const perNetGems = perCost - perCommission;

    const result = await this.prisma.$transaction(async (tx) => {
      try {
        const userMap = await this.ledger.lockUsers(tx, [
          senderId,
          ...receiverIds,
        ]);
        for (const rid of receiverIds) {
          if (!userMap.get(rid.toString())) {
            throw new NotFoundException({
              success: false,
              error: {
                code: 'RECEIVER_NOT_FOUND',
                message: `Receiver ${rid} not found`,
              },
            });
          }
        }

        const batchRef = `room_${room.id}_batch_${gift.id}_${senderId}_${Date.now()}`;
        const sender = userMap.get(senderId.toString());
        if (!sender || sender.wallet_balance < totalCost) {
          throw Object.assign(new Error('INSUFFICIENT_BALANCE'), {
            code: 'INSUFFICIENT_BALANCE',
          });
        }

        let currentSender = sender;
        let finalBalance = currentSender.wallet_balance;
        const txIds: string[] = [];

        for (const rid of receiverIds) {
          const giftRef = `room_${room.id}_gift_${gift.id}_${senderId}_${rid}_${Date.now()}`;
          const debitRes = await this.ledger.debitCoins(
            tx,
            senderId,
            perCost,
            'GIFT',
            `Room gift: ${gift.name}`,
            giftRef,
            currentSender,
            {
              room_id: room.id,
              gift_id: Number(gift.id),
              receiver_id: Number(rid),
              quantity,
              batch_ref: batchRef,
            },
          );
          currentSender = debitRes.locked;
          finalBalance = debitRes.after;

          await tx.user.update({
            where: { id: rid },
            data: {
              gems: { increment: perNetGems },
              totalEarnedCoins: { increment: perNetGems },
            },
          });
          txIds.push(`RG_${Date.now()}_${rid}`);
        }

        return {
          transaction_ids: txIds,
          coin_amount: Number(totalCost),
          per_receiver_coin_amount: Number(perCost),
          receiver_count: receiverIds.length,
          sender_balance_after: Number(finalBalance),
          agency_cashback: null,
        };
      } catch (e) {
        if ((e as { code?: string }).code === 'INSUFFICIENT_BALANCE') {
          throw new BadRequestException({
            success: false,
            error: {
              code: 'INSUFFICIENT_BALANCE',
              message: 'Insufficient coin balance for batch gift',
            },
          });
        }
        if ((e as { code?: string }).code === 'USER_NOT_FOUND') {
          throw new NotFoundException({
            success: false,
            error: {
              code: 'RECEIVER_NOT_FOUND',
              message: 'Receiver not found',
            },
          });
        }
        throw e;
      }
    });

    for (const rid of receiverIds) {
      this.events.emitGiftOverlay(room.id, {
        gift_id: Number(gift.id),
        image_url: gift.imageUrl,
        animation_url: gift.animationUrl,
        sender_id: Number(senderId),
        receiver_id: Number(rid),
        quantity,
      });
    }

    return result;
  }

  async giftStats(userId: bigint, id: string) {
    const room = await this.findRoom(id);
    await this.requireActiveMember(room.id, userId);
    const rows = await this.prisma.coinTransaction.findMany({
      where: {
        type: 'GIFT',
        coinAmount: { lt: 0 },
        OR: [
          { referenceId: { startsWith: `room_${room.id}_` } },
          { meta: { path: ['room_id'], equals: room.id } },
        ],
      },
      include: { user: true },
      orderBy: { id: 'desc' },
    });
    const senders = new Map<
      string,
      {
        user_id: number;
        name: string | null;
        avatar: string | null;
        coins: number;
        gift_count: number;
      }
    >();
    const receivers = new Map<
      string,
      {
        user_id: number;
        name: string | null;
        avatar: string | null;
        coins: number;
        gift_count: number;
      }
    >();
    let totalCoins = 0;
    for (const row of rows) {
      const coins = Math.abs(Number(row.coinAmount));
      totalCoins += coins;
      const sid = Number(row.userId);
      const prev = senders.get(String(sid));
      senders.set(String(sid), {
        user_id: sid,
        name: row.user.displayName ?? row.user.name,
        avatar: row.user.avatarUrl,
        coins: (prev?.coins ?? 0) + coins,
        gift_count: (prev?.gift_count ?? 0) + 1,
      });
      const meta = (row.meta ?? {}) as { receiver_id?: number };
      if (meta.receiver_id) {
        const rid = Number(meta.receiver_id);
        const rprev = receivers.get(String(rid));
        receivers.set(String(rid), {
          user_id: rid,
          name: rprev?.name ?? null,
          avatar: rprev?.avatar ?? null,
          coins: (rprev?.coins ?? 0) + coins,
          gift_count: (rprev?.gift_count ?? 0) + 1,
        });
      }
    }
    const recvIds = [...receivers.keys()].map((k) => BigInt(k));
    if (recvIds.length) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: recvIds } },
      });
      for (const u of users) {
        const rec = receivers.get(String(Number(u.id)));
        if (rec) {
          rec.name = u.displayName ?? u.name;
          rec.avatar = u.avatarUrl;
        }
      }
    }
    return {
      room_id: room.id,
      total_coins: totalCoins,
      gift_count: rows.length,
      senders: [...senders.values()].sort((a, b) => b.coins - a.coins),
      receivers: [...receivers.values()].sort((a, b) => b.coins - a.coins),
    };
  }

  private async findRoom(id: string) {
    const include = {
      owner: true,
      host: true,
      coHost: true,
      theme: true,
      _count: { select: { members: { where: { isActive: true } } } },
    };
    const room = id.includes('-')
      ? await this.prisma.room.findUnique({ where: { id }, include })
      : await this.prisma.room.findUnique({
          where: { displayId: id },
          include,
        });
    if (!room) {
      throw new NotFoundException({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Room not found' },
      });
    }
    return room;
  }

  private async requireActiveMember(roomId: string, userId: bigint) {
    const member = await this.prisma.roomMember.findFirst({
      where: { roomId, userId, isActive: true },
    });
    if (!member) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'NOT_IN_ROOM', message: 'Join the room first' },
      });
    }
    return member;
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { catalogClientFields } from '../../common/utils/catalog-media';
import { normalizeGiftCategory } from '../../common/utils/gift-category';
import {
  GiftSendSelector,
  resolveGiftForSend,
} from '../../common/utils/gift-resolve';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LedgerService } from '../wallet/ledger.service';
import { RelationshipEngineService } from '../relationship/relationship-engine.service';
import { resolveAgencyRoomMeta } from './agency-room-meta';
import { RoomEvents } from './room.events';
import { RocketLaunchService } from './rocket-launch.service';
import { CpAffectionGiftsService } from './cp-affection-gifts.service';
import { GiftBroadcastService } from './gift-broadcast.service';
import { RedisService } from '../../common/redis/redis.service';

@Injectable()
export class RoomGiftingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly events: RoomEvents,
    private readonly relationships: RelationshipEngineService,
    private readonly rockets: RocketLaunchService,
    private readonly cpAffectionGifts: CpAffectionGiftsService,
    private readonly giftBroadcast: GiftBroadcastService,
    private readonly redis: RedisService,
  ) {}

  async giftTypes() {
    await this.cpAffectionGifts.ensureCatalog();
    let gifts = await this.prisma.gift.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    });

    if (gifts.length === 0) {
      await this.prisma.gift.createMany({
        data: [
          { name: 'Rose', coinCost: 10, category: 'standard', imageUrl: null },
          { name: 'Kiss', coinCost: 20, category: 'standard', imageUrl: null },
          { name: 'Sweet Box', coinCost: 30, category: 'standard', imageUrl: null },
          { name: 'Heart', coinCost: 50, category: 'standard', imageUrl: null },
          { name: 'Love Letter', coinCost: 80, category: 'standard', imageUrl: null },
          { name: 'Diamond', coinCost: 100, category: 'standard', imageUrl: null },
          { name: 'Wish Star', coinCost: 150, category: 'standard', imageUrl: null },
          { name: 'Perfume', coinCost: 200, category: 'standard', imageUrl: null },
          { name: 'Teddy Bear', coinCost: 300, category: 'standard', imageUrl: null },
          { name: 'Crown', coinCost: 500, category: 'standard', imageUrl: null },
          { name: 'Champagne', coinCost: 800, category: 'standard', imageUrl: null },
          { name: 'Magic Ring', coinCost: 1000, category: 'standard', imageUrl: null },
          { name: 'Rocket', coinCost: 2000, category: 'standard', imageUrl: null },
          { name: 'Sports Car', coinCost: 5000, category: 'standard', imageUrl: null },
          { name: 'Velvet Box', coinCost: 8000, category: 'standard', imageUrl: null },
          { name: 'Cupid Bow', coinCost: 10000, category: 'standard', imageUrl: null },
          { name: 'Moonlight', coinCost: 15000, category: 'standard', imageUrl: null },
          { name: 'Soul Swans', coinCost: 20000, category: 'standard', imageUrl: null },
          { name: 'Luxury Yacht', coinCost: 30000, category: 'standard', imageUrl: null },
          { name: 'Besties Crown', coinCost: 50000, category: 'standard', imageUrl: null },
          { name: 'Fireworks', coinCost: 80000, category: 'standard', imageUrl: null },
          { name: 'Dragon Fortune', coinCost: 100000, category: 'standard', imageUrl: null },
          { name: 'Golden Slot', coinCost: 150000, category: 'standard', imageUrl: null },
          { name: 'Mega Jackpot', coinCost: 200000, category: 'standard', imageUrl: null },
          { name: 'Power Ring', coinCost: 15000, category: 'standard', imageUrl: null },
          { name: 'Good Friend', coinCost: 36000, category: 'standard', imageUrl: null },
          { name: 'Love Perfume', coinCost: 60000, category: 'standard', imageUrl: null },
          { name: 'Luxury Belt', coinCost: 120000, category: 'standard', imageUrl: null },
          { name: 'Luxury Perfume', coinCost: 120000, category: 'standard', imageUrl: null },
          { name: 'Luxury Bag', coinCost: 200000, category: 'standard', imageUrl: null },
          { name: 'Kiss kiss', coinCost: 300000, category: 'standard', imageUrl: null },
          { name: 'Luxury Watch', coinCost: 400000, category: 'standard', imageUrl: null },
          { name: 'Rich Tiger', coinCost: 400000, category: 'standard', imageUrl: null },
          { name: 'Fountain', coinCost: 500000, category: 'standard', imageUrl: null },
          { name: 'Wedding Hall', coinCost: 600000, category: 'standard', imageUrl: null },
          { name: 'Brilliant Fireworks', coinCost: 600000, category: 'standard', imageUrl: null },
          { name: 'Bear Bouquet', coinCost: 600000, category: 'standard', imageUrl: null },
          { name: 'Love Carousel', coinCost: 600000, category: 'standard', imageUrl: null },
          { name: 'Teddy Love', coinCost: 600000, category: 'standard', imageUrl: null },
          { name: 'Super Rich', coinCost: 600000, category: 'standard', imageUrl: null },
          { name: 'Galaxy Fireworks', coinCost: 800000, category: 'standard', imageUrl: null },
          { name: 'Alpaca Love', coinCost: 900000, category: 'standard', imageUrl: null },
          { name: 'Alpaca', coinCost: 960000, category: 'standard', imageUrl: null },
          { name: 'Rolls-Royce', coinCost: 960000, category: 'standard', imageUrl: null },
          { name: 'Wedding', coinCost: 1200000, category: 'standard', imageUrl: null },
          { name: 'Sweet Cake', coinCost: 1200000, category: 'standard', imageUrl: null },
          { name: 'Yacht Party', coinCost: 1200000, category: 'standard', imageUrl: null },
          { name: 'Mysterious Car', coinCost: 1500000, category: 'standard', imageUrl: null },
          { name: 'DJ Cat', coinCost: 1500000, category: 'standard', imageUrl: null },
          { name: 'Flower Yacht', coinCost: 1500000, category: 'standard', imageUrl: null },
          { name: 'Love Yacht', coinCost: 1800000, category: 'standard', imageUrl: null },
          { name: 'Pink Rose CP', coinCost: 2000000, category: 'standard', imageUrl: null },
          { name: 'Rose Stairs', coinCost: 2000000, category: 'standard', imageUrl: null },
          { name: 'Forever Love', coinCost: 2400000, category: 'standard', imageUrl: null },
          { name: 'Rose Ball', coinCost: 2400000, category: 'standard', imageUrl: null },
          { name: 'Dance Cat', coinCost: 2400000, category: 'standard', imageUrl: null },
          { name: 'Waltz', coinCost: 2400000, category: 'standard', imageUrl: null },
          { name: 'Love Melody', coinCost: 2500000, category: 'standard', imageUrl: null },
          { name: 'Lion', coinCost: 2500000, category: 'standard', imageUrl: null },
          { name: 'Wealth Queen', coinCost: 2500000, category: 'standard', imageUrl: null },
          { name: 'Lion King', coinCost: 3000000, category: 'standard', imageUrl: null },
          { name: 'Lion Guardian', coinCost: 5000000, category: 'standard', imageUrl: null },
          { name: 'Temple Throne', coinCost: 6000000, category: 'standard', imageUrl: null },
        ],
      });
      gifts = await this.prisma.gift.findMany({
        where: { isActive: true },
        orderBy: { id: 'asc' },
      });
    }

    return {
      gifts: gifts.map((g) => {
        const cleanImg = g.imageUrl?.includes('giphy.com') ? null : g.imageUrl;
        const cleanAnim = g.animationUrl?.includes('giphy.com') ? null : g.animationUrl;
        return {
          id: Number(g.id),
          gift_key: g.giftKey ?? null,
          name: g.name,
          coin_cost: g.coinCost,
          coin_price: g.coinCost,
          category: normalizeGiftCategory(g.category),
          ...catalogClientFields(cleanImg, cleanAnim),
        };
      }),
    };
  }

  private resolveGift(selector: GiftSendSelector) {
    return resolveGiftForSend(this.prisma, selector);
  }

  async sendRoomGift(
    senderId: bigint,
    id: string,
    body: {
      gift_id: number | string;
      receiver_id: number | string;
      quantity?: number;
      gift_name?: string;
      gift_key?: string;
      gift_category?: string;
      expected_coin_cost?: number | string;
    },
  ) {
    const room = await this.findRoom(id);
    const quantity = Math.min(Math.max(Number(body.quantity ?? 1), 1), 100);
    const gift = await this.resolveGift(body);
    const receiverId = BigInt(body.receiver_id);
    await this.requireActiveMember(room.id, senderId);
    const seated = await this.prisma.seat.findFirst({
      where: { roomId: room.id, userId: receiverId },
    });
    if (
      !seated &&
      room.hostId !== receiverId &&
      room.ownerId !== receiverId
    ) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'RECEIVER_NOT_SEATED',
          message: 'Gifts can only be sent to seated members',
        },
      });
    }
    const settings = await this.prisma.adminSetting.findUnique({
      where: { id: 1 },
    });
    const commissionPct = Number(settings?.giftCommissionPct ?? 20) / 100;
    const cost = BigInt(gift.coinCost * quantity);
    const commission = BigInt(Math.floor(Number(cost) * commissionPct));
    const netGems = cost - commission;

    // Idempotency: guard against duplicate/retried requests before deducting coins (Req 7a)
    const idemKey = (body as any).idempotency_key
      ? `gift_idem_req:${senderId}:${(body as any).idempotency_key}`
      : `gift_dedup:${senderId}:${room.id}:${gift.id}:${receiverId}:${quantity}`;
    const redisClient = this.redis.getClient();
    const isNewReq = await redisClient.set(idemKey, 'IN_PROGRESS', 'EX', 10, 'NX');
    if (!isNewReq) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'DUPLICATE_REQUEST',
          message: 'This gift request is already processing or was recently submitted',
        },
      });
    }

    let result;
    try {
      result = await this.prisma.$transaction(async (tx) => {
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
        const { after: afterDebit, locked: senderAfterDebit } = await this.ledger.debitCoins(
          tx,
          senderId,
          cost,
          'GIFT',
          `Room gift: ${gift.name}`,
          ref,
          senderLocked,
          {
            source: 'gift',
            currency: 'coins',
            room_id: room.id,
            gift_id: Number(gift.id),
            receiver_id: Number(receiverId),
            quantity,
          },
          'gift',
        );
        await tx.user.update({
          where: { id: receiverId },
          data: {
            gems: { increment: netGems },
            totalEarnedCoins: { increment: netGems },
          },
        });
        const receiverGemsAfter = BigInt(recv.gems) + netGems;
        await this.ledger.recordGiftGems(tx, {
          receiverId,
          senderId,
          giftId: gift.id,
          gems: netGems,
          gemsAfter: receiverGemsAfter,
          commission,
          referenceId: ref,
          source: 'room_gift',
          roomId: room.id,
          quantity,
        });
        const luckyRebate = await this.ledger.applyLuckyGiftRebate(tx, {
          senderId,
          giftId: gift.id,
          giftCategory: gift.category,
          giftCost: cost,
          referenceId: ref,
          senderLock: senderAfterDebit,
        });
        const after = luckyRebate?.balanceAfter ?? afterDebit;
        const relationship = await this.relationships.applyContribution(tx, {
          senderId,
          receiverId,
          giftId: gift.id,
          giftCategory: gift.category,
          giftCoinCost: gift.coinCost,
          quantity,
          giftTransactionId: ref,
          source: 'room',
          roomId: room.id,
        });
        return {
          transaction_id: ref,
          gift_id: Number(gift.id),
          gift_key: gift.giftKey ?? null,
          unit_coin_cost: gift.coinCost,
          quantity,
          coin_amount: Number(cost),
          commission_amount: Number(commission),
          net_amount: Number(netGems),
          sender_balance_after: Number(after),
          receiver_gems_after: Number(receiverGemsAfter),
          lucky_rebate: luckyRebate
            ? { pct: luckyRebate.pct, coins: luckyRebate.coins }
            : null,
          balances: {
            coins: Number(after),
            gems: Number(senderLocked.gems),
            referral_balance: Number(senderLocked.referral_balance),
          },
          agency_cashback: null,
          relationship,
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
      await redisClient.set(idemKey, 'COMPLETED', 'EX', 30);
    } catch (e) {
      await redisClient.del(idemKey);
      throw e;
    }
    const agency = await resolveAgencyRoomMeta(
      this.prisma,
      room.ownerId,
      room.id,
    );

    // Guard transaction_id ref in Redis for 30 s to avoid re-broadcasting
    const idempotencyKey = `gift_idem:${result.transaction_id}`;
    const isNew = await redisClient.set(idempotencyKey, '1', 'EX', 30, 'NX');
    if (!isNew) {
      return { ...result, agency_cashback: agency.agency_cashback, rocket: null };
    }

    {
      // Resolve admin-configured visualTier from gift metadata.
      // Falls back to coin-cost heuristic until gift table has a visualTier column.
      const resolvedTier: import('./gift-broadcast.service').GiftVisualTier = (() => {
        const cost = gift.coinCost;
        if (cost >= 5000) return 'ULTRA';
        if (cost >= 500) return 'HIGH';
        if (cost >= 50) return 'MEDIUM';
        return 'LOW';
      })();

      this.giftBroadcast.enqueue(room.id, {
        giftId: Number(gift.id),
        giftKey: gift.giftKey ?? null,
        unitCoinCost: gift.coinCost,
        ...catalogClientFields(gift.imageUrl, gift.animationUrl),
        senderId: Number(senderId),
        receiverId: Number(receiverId),
        tier: resolvedTier,
        count: quantity,
        costCoins: Number(cost),
        createdAt: Date.now(),
      } as import('./gift-broadcast.service').GiftDisplayEvent);
    }
    const rocket =
      gift.category === 'cp' || gift.category === 'bcp'
        ? null
        : await this.rockets.applyGiftContribution(
            room.id,
            senderId,
            Number(cost),
            result.transaction_id,
          );
    return {
      ...result,
      agency_cashback: agency.agency_cashback,
      rocket,
    };
  }

  async sendBatchGift(
    senderId: bigint,
    body: {
      gift_id: number | string;
      receiver_ids: Array<number | string>;
      quantity?: number;
      room_id: string;
      gift_name?: string;
      gift_key?: string;
      gift_category?: string;
      expected_coin_cost?: number | string;
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
    const gift = await this.resolveGift(body);

    await this.requireActiveMember(room.id, senderId);

    // Soft-filter: skip receivers who left / are not seated instead of failing the whole All-send.
    const eligibleIds: bigint[] = [];
    for (const rid of receiverIds) {
      if (rid === senderId) continue;
      const seated = await this.prisma.seat.findFirst({
        where: { roomId: room.id, userId: rid },
      });
      if (
        seated ||
        room.hostId === rid ||
        room.ownerId === rid
      ) {
        eligibleIds.push(rid);
      }
    }
    if (eligibleIds.length === 0) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'NO_SEATED_RECEIVERS',
          message: 'No selected receivers are seated in this room',
        },
      });
    }

    const settings = await this.prisma.adminSetting.findUnique({
      where: { id: 1 },
    });
    const commissionPct = Number(settings?.giftCommissionPct ?? 20) / 100;
    const perCost = BigInt(gift.coinCost * quantity);
    const totalCost = perCost * BigInt(eligibleIds.length);
    const perCommission = BigInt(Math.floor(Number(perCost) * commissionPct));
    const perNetGems = perCost - perCommission;

    // Idempotency: guard against duplicate/retried batch requests (Req 7a)
    const batchIdemKey = (body as any).idempotency_key
      ? `gift_idem_req:${senderId}:${(body as any).idempotency_key}`
      : `gift_batch_dedup:${senderId}:${room.id}:${gift.id}:${eligibleIds.map(String).sort().join(',')}:${quantity}`;
    const redisClient = this.redis.getClient();
    const isNewBatchReq = await redisClient.set(batchIdemKey, 'IN_PROGRESS', 'EX', 10, 'NX');
    if (!isNewBatchReq) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'DUPLICATE_REQUEST',
          message: 'This batch gift request is already processing or was recently submitted',
        },
      });
    }

    let result;
    try {
      result = await this.prisma.$transaction(async (tx) => {
      try {
        const userMap = await this.ledger.lockUsers(tx, [
          senderId,
          ...eligibleIds,
        ]);
        for (const rid of eligibleIds) {
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
        const luckyRebates: { receiver_id: number; pct: number; coins: number }[] = [];
        const relationships: Awaited<
          ReturnType<RelationshipEngineService['applyContribution']>
        >[] = [];

        for (const rid of eligibleIds) {
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
              source: 'gift',
              currency: 'coins',
              room_id: room.id,
              gift_id: Number(gift.id),
              receiver_id: Number(rid),
              quantity,
              batch_ref: batchRef,
            },
            'gift',
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
          const recvLocked = userMap.get(rid.toString())!;
          const recvGemsAfter = BigInt(recvLocked.gems) + perNetGems;
          userMap.set(rid.toString(), { ...recvLocked, gems: recvGemsAfter });
          await this.ledger.recordGiftGems(tx, {
            receiverId: rid,
            senderId,
            giftId: gift.id,
            gems: perNetGems,
            gemsAfter: recvGemsAfter,
            commission: perCommission,
            referenceId: giftRef,
            source: 'room_gift',
            roomId: room.id,
            quantity,
          });
          const rebate = await this.ledger.applyLuckyGiftRebate(tx, {
            senderId,
            giftId: gift.id,
            giftCategory: gift.category,
            giftCost: perCost,
            referenceId: giftRef,
            senderLock: currentSender,
          });
          if (rebate) {
            luckyRebates.push({ receiver_id: Number(rid), pct: rebate.pct, coins: rebate.coins });
            if (rebate.coins > 0) {
              currentSender = { ...currentSender, wallet_balance: rebate.balanceAfter };
              finalBalance = rebate.balanceAfter;
            }
          }
          const relationship = await this.relationships.applyContribution(tx, {
            senderId,
            receiverId: rid,
            giftId: gift.id,
            giftCategory: gift.category,
            giftCoinCost: gift.coinCost,
            quantity,
            giftTransactionId: giftRef,
            source: 'room',
            roomId: room.id,
          });
          txIds.push(giftRef);
          relationships.push(relationship);
        }

        return {
          transaction_ids: txIds,
          gift_id: Number(gift.id),
          gift_key: gift.giftKey ?? null,
          unit_coin_cost: gift.coinCost,
          quantity,
          coin_amount: Number(totalCost),
          per_receiver_coin_amount: Number(perCost),
          receiver_count: eligibleIds.length,
          sender_balance_after: Number(finalBalance),
          lucky_rebate: luckyRebates.length
            ? {
                coins: luckyRebates.reduce((s, r) => s + r.coins, 0),
                items: luckyRebates,
              }
            : null,
          agency_cashback: null,
          relationships,
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
      await redisClient.set(batchIdemKey, 'COMPLETED', 'EX', 30);
    } catch (e) {
      await redisClient.del(batchIdemKey);
      throw e;
    }

    {
      const media = catalogClientFields(gift.imageUrl, gift.animationUrl);
      const resolvedTier: import('./gift-broadcast.service').GiftVisualTier = (() => {
        const cost = gift.coinCost;
        if (cost >= 5000) return 'ULTRA';
        if (cost >= 500) return 'HIGH';
        if (cost >= 50) return 'MEDIUM';
        return 'LOW';
      })();

      const now = Date.now();
      for (const rid of eligibleIds) {
        this.giftBroadcast.enqueue(room.id, {
          giftId: Number(gift.id),
          giftKey: gift.giftKey ?? null,
          unitCoinCost: gift.coinCost,
          ...media,
          senderId: Number(senderId),
          receiverId: Number(rid),
          tier: resolvedTier,
          count: quantity,
          costCoins: Number(gift.coinCost),
          createdAt: now,
        });
      }
    }

    const agency = await resolveAgencyRoomMeta(
      this.prisma,
      room.ownerId,
      room.id,
    );
    const rocketTx =
      result.transaction_ids?.[0] ??
      `batch_${room.id}_${senderId}_${Date.now()}`;
    const rocket =
      gift.category === 'cp' || gift.category === 'bcp'
        ? null
        : await this.rockets.applyGiftContribution(
            room.id,
            senderId,
            Number(totalCost),
            rocketTx,
          );
    return {
      ...result,
      agency_cashback: agency.agency_cashback,
      rocket,
    };
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

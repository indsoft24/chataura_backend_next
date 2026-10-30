import { Injectable } from '@nestjs/common';
import { FcmService } from '../../common/fcm/fcm.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LedgerService } from '../wallet/ledger.service';
import { svipMonth } from './svip.rules';
import { SvipService, svipError } from './svip.service';

const IST_OFFSET_MS = 330 * 60_000;
const MAX_RECHARGE_COINS = 1_000_000_000n;

/** 00:00 IST of today / of the 1st of this IST month, as a UTC instant. */
function istStart(now: Date, unit: 'day' | 'month'): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const day = unit === 'day' ? ist.getUTCDate() : 1;
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), day) - IST_OFFSET_MS);
}

/**
 * Coin seller side of SVIP: the seller pays the admin's price (and any recharge coins) from their own balance,
 * the user gets the SVIP. Everything happens in one transaction through the ledger.
 */
@Injectable()
export class SvipSellerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly svip: SvipService,
    private readonly fcm: FcmService,
  ) {}

  /** Only a live coin seller; the role is read from the database, never from the token. */
  private async requireSeller(sellerId: bigint) {
    const u = await this.prisma.user.findUnique({
      where: { id: sellerId },
      select: { role: true, deletedAt: true, accountStatus: true, isSuspended: true, walletBalance: true },
    });
    if (!u || u.role !== 'seller' || u.deletedAt || u.accountStatus !== 'active' || u.isSuspended)
      svipError('FORBIDDEN', 'Only coin sellers can do this');
    return u;
  }

  async panel(sellerId: bigint) {
    const seller = await this.requireSeller(sellerId);
    const { settings, levels } = await this.svip.config();
    const now = new Date();
    const totals = async (since: Date) => {
      const t = await this.prisma.svipGift.aggregate({
        where: { giverId: sellerId, giverRole: 'seller', createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { priceCoins: true, rechargeCoins: true },
      });
      return {
        gifts: t._count._all,
        spent_coins: Number((t._sum.priceCoins ?? 0n) + (t._sum.rechargeCoins ?? 0n)),
      };
    };
    return {
      enabled: settings.enabled,
      balance: Number(seller.walletBalance),
      days: settings.periodDays,
      month: svipMonth(now),
      today: await totals(istStart(now, 'day')),
      this_month: await totals(istStart(now, 'month')),
      levels: levels
        .filter((l) => l.sellerPrice > 0n)
        .map((l) => ({ level: l.level, name: l.name, price: Number(l.sellerPrice) })),
    };
  }

  /** Shows who the seller is about to give SVIP to, and what they have now. */
  async lookup(sellerId: bigint, ref: string) {
    await this.requireSeller(sellerId);
    const userId = await this.svip.resolveUser(ref);
    const [u, card] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true, displayId: true, name: true, displayName: true, avatarUrl: true, deletedAt: true },
      }),
      this.svip.levelOf(userId),
    ]);
    if (u.deletedAt) svipError('USER_NOT_FOUND', 'User not found');
    const m = card > 0 ? await this.prisma.userSvip.findUnique({ where: { userId } }) : null;
    return {
      user_id: u.id.toString(),
      display_id: u.displayId,
      name: u.displayName ?? u.name,
      avatar_url: u.avatarUrl,
      svip_level: card,
      svip_ends_at: m?.periodEndsAt.toISOString() ?? null,
    };
  }

  async gift(
    sellerId: bigint,
    body: { user?: string; level?: number | string; with_recharge?: boolean; recharge_coins?: number | string; request_id?: string },
  ) {
    await this.requireSeller(sellerId);
    const requestId = String(body.request_id ?? '');
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(requestId)) svipError('VALIDATION_ERROR', 'request_id is required');
    const level = Number(body.level);
    const rcRaw = body.with_recharge ? String(body.recharge_coins ?? '').trim() : '0';
    if (!/^\d{1,10}$/.test(rcRaw)) svipError('VALIDATION_ERROR', 'Enter the recharge coins as a whole number');
    const recharge = BigInt(rcRaw);
    if (body.with_recharge && (recharge <= 0n || recharge > MAX_RECHARGE_COINS))
      svipError('VALIDATION_ERROR', 'Recharge coins must be more than 0');

    const userId = await this.svip.resolveUser(String(body.user ?? ''));
    if (userId === sellerId) svipError('SELF_GIFT_FORBIDDEN', 'You cannot give SVIP to yourself');
    const { settings, levels } = await this.svip.config();
    const lv = levels.find((l) => l.level === level);
    if (!lv) svipError('LEVEL_NOT_FOUND', 'SVIP level not found');
    if (lv.sellerPrice <= 0n) svipError('NOT_FOR_SELLERS', 'This level cannot be given by sellers');
    const total = lv.sellerPrice + recharge;

    const out = await this.prisma.$transaction(async (tx) => {
      // Same order everywhere: member advisory lock first, then the user rows.
      await this.svip.lockMember(tx, userId);
      const locks = await this.ledger.lockUsers(tx, [sellerId, userId]);
      const dup = await tx.svipGift.findUnique({ where: { giverId_requestId: { giverId: sellerId, requestId } } });
      if (dup) return { replayed: true, kind: dup.kind, price: dup.priceCoins, recharge: dup.rechargeCoins, level: dup.level };

      const live = await tx.user.findUnique({
        where: { id: sellerId },
        select: { role: true, deletedAt: true, accountStatus: true, isSuspended: true },
      });
      if (!live || live.role !== 'seller' || live.deletedAt || live.accountStatus !== 'active' || live.isSuspended)
        svipError('FORBIDDEN', 'Only coin sellers can do this');
      const target = await tx.user.findUnique({ where: { id: userId }, select: { deletedAt: true } });
      if (!target || target.deletedAt) svipError('USER_NOT_FOUND', 'User not found');

      try {
        await this.ledger.debitCoins(tx, sellerId, total, 'SVIP_SELLER_GIFT', `SVIP ${level} given to user`, `svip_gift_${sellerId}_${requestId}`, locks.get(sellerId.toString()), {
          source: 'svip',
          currency: 'coins',
          receiver_id: userId.toString(),
          level,
          price: lv.sellerPrice.toString(),
          recharge_coins: recharge.toString(),
        });
      } catch (e) {
        if ((e as { code?: string }).code === 'INSUFFICIENT_BALANCE') svipError('INSUFFICIENT_BALANCE', 'Not enough coins in your balance');
        throw e;
      }
      const gift = await this.svip.giftInTx(tx, userId, level, settings.periodDays, 'seller', false);
      if (recharge > 0n)
        await this.ledger.creditCoins(tx, userId, recharge, 'SELLER_TRANSFER', 'Recharge from coin seller', `svip_gift_rc_${sellerId}_${requestId}`, locks.get(userId.toString()), {
          source: 'svip',
          currency: 'coins',
          sender_id: sellerId.toString(),
        });
      await tx.svipGift.create({
        data: { giverId: sellerId, giverRole: 'seller', userId, level, days: settings.periodDays, kind: gift.kind, priceCoins: lv.sellerPrice, rechargeCoins: recharge, requestId },
      });
      return { replayed: false, kind: gift.kind, price: lv.sellerPrice, recharge, level };
    });

    if (!out.replayed)
      await this.fcm
        .sendUserNotification({
          userId,
          title: `SVIP ${level} received`,
          body: `A coin seller gave you SVIP ${level} for ${settings.periodDays} days.`,
          data: { type: 'svip', outcome: 'gift' },
        })
        .catch(() => undefined);
    const bal = await this.prisma.user.findUniqueOrThrow({ where: { id: sellerId }, select: { walletBalance: true } });
    return {
      replayed: out.replayed,
      kind: out.kind,
      level: out.level,
      charged_coins: Number(out.price + out.recharge),
      balance: Number(bal.walletBalance),
    };
  }

  async history(sellerId: bigint, cursor?: string) {
    await this.requireSeller(sellerId);
    const take = 30;
    const rows = await this.prisma.svipGift.findMany({
      where: { giverId: sellerId, giverRole: 'seller', ...(cursor && /^\d{1,18}$/.test(cursor) ? { id: { lt: BigInt(cursor) } } : {}) },
      orderBy: { id: 'desc' },
      take: take + 1,
    });
    const page = rows.slice(0, take);
    const users = await this.prisma.user.findMany({
      where: { id: { in: page.map((r) => r.userId) } },
      select: { id: true, displayId: true, name: true, displayName: true, avatarUrl: true },
    });
    const byId = new Map(users.map((u) => [u.id.toString(), u]));
    return {
      items: page.map((r) => {
        const u = byId.get(r.userId.toString());
        return {
          id: r.id.toString(),
          user_id: r.userId.toString(),
          display_id: u?.displayId ?? null,
          name: u?.displayName ?? u?.name ?? null,
          avatar_url: u?.avatarUrl ?? null,
          level: r.level,
          kind: r.kind,
          price: Number(r.priceCoins),
          recharge_coins: Number(r.rechargeCoins),
          created_at: r.createdAt.toISOString(),
        };
      }),
      next_cursor: rows.length > take ? page[page.length - 1].id.toString() : null,
    };
  }
}

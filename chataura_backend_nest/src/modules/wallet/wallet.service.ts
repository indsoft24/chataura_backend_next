import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import Razorpay from 'razorpay';
import { catalogClientFields } from '../../common/utils/catalog-media';
import { normalizeGiftCategory } from '../../common/utils/gift-category';
import { PrismaService } from '../../common/prisma/prisma.service';
import { IndianState, resolveIndianState } from '../../common/gst/indian-states';
import { indianStateFromIp } from '../../common/gst/ip-geo';
import { ensureCpAffectionGiftCatalog } from '../room/cp-affection-gifts.catalog';
import { ensureExtraGiftCatalogs } from '../room/extra-gift-catalogs';
import { RelationshipEngineService } from '../relationship/relationship-engine.service';
import { LedgerService } from './ledger.service';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);
  private razorpay: Razorpay | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly config: ConfigService,
    private readonly relationships: RelationshipEngineService,
  ) {
    const keyId = this.config.get<string>('RAZORPAY_KEY_ID');
    const keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET');
    if (keyId && keySecret) {
      this.razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    }
  }

  async getSettings() {
    let row = await this.prisma.adminSetting.findUnique({ where: { id: 1 } });
    if (!row) {
      row = await this.prisma.adminSetting.create({ data: { id: 1 } });
    }
    return row;
  }

  async balance(userId: bigint) {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    return {
      wallet_balance: Number(u.walletBalance),
      coins: Number(u.walletBalance),
      coin_balance: Number(u.walletBalance),
      total_earned_coins: Number(u.totalEarnedCoins),
      gems: Number(u.gems),
      referral_balance: Number(u.referralBalance),
      inr_earnings_balance: Number(u.inrEarningsBalance),
      usd_earnings_balance: Number(u.usdEarningsBalance),
    };
  }

  async packages(country?: string) {
    const pkgs = await this.prisma.coinPackage.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    const mapped = pkgs.map((p) => ({
      id: Number(p.id),
      audience: p.audience,
      coins: p.coins,
      coin_amount: p.coins,
      currency: p.currency,
      price: Number(p.price),
      original_price: p.originalPrice ? Number(p.originalPrice) : null,
      base_price_inr: p.basePriceInr ? Number(p.basePriceInr) : null,
    }));
    const currency = mapped[0]?.currency ?? 'INR';
    return {
      country: country ?? 'IN',
      currency,
      viewer: 'user',
      promo: null,
      packages: mapped,
      seller_promo: null,
      seller_packages: mapped.filter(
        (p) =>
          p.audience === 'coin_seller' ||
          p.audience === 'reseller' ||
          p.audience === 'seller',
      ),
    };
  }

  async initiateRecharge(
    userId: bigint,
    body: { package_id: number | string; country?: string; currency?: string; state?: string },
    clientIp?: string,
  ) {
    const pkg = await this.prisma.coinPackage.findFirst({
      where: { id: BigInt(body.package_id), isActive: true },
    });
    if (!pkg) {
      throw new NotFoundException({
        success: false,
        error: { code: 'PACKAGE_NOT_FOUND', message: 'Package not found' },
      });
    }

    const currency = (body.currency ?? pkg.currency ?? 'INR').toUpperCase();
    const amountMinor = Math.round(Number(pkg.price) * 100);
    const placeOfSupply = await this.resolvePlaceOfSupply(userId, body, currency, clientIp);
    const keyId = this.config.get<string>('RAZORPAY_KEY_ID') || 'rzp_test_mock';

    let orderId: string;
    if (this.razorpay) {
      try {
        const order = await this.razorpay.orders.create({
          amount: amountMinor,
          currency,
          receipt: `ca_${userId}_${Date.now()}`,
          notes: {
            user_id: String(userId),
            package_id: String(pkg.id),
            coins: String(pkg.coins),
          },
        });
        orderId = String(order.id);
      } catch (e) {
        this.logger.error(`Razorpay order failed: ${String(e)}`);
        throw new ServiceUnavailableException({
          success: false,
          error: {
            code: 'GATEWAY_TIMEOUT',
            message: 'Payment gateway unavailable',
          },
        });
      }
    } else {
      orderId = `order_mock_${randomBytes(8).toString('hex')}`;
    }

    await this.prisma.coinPurchaseTransaction.create({
      data: {
        userId,
        packageId: pkg.id,
        razorpayOrderId: orderId,
        amountMinor,
        currency,
        coinsCredited: pkg.coins,
        status: 'pending',
        paymentSource: this.razorpay ? 'RAZORPAY' : 'MOCK',
        country: body.country ?? null,
        // GST place of supply: only stored when it resolves to a real Indian state.
        state: placeOfSupply?.state.name ?? null,
        stateSource: placeOfSupply?.source ?? null,
        clientIp: clientIp?.slice(0, 64) ?? null,
      },
    });

    return {
      key_id: keyId,
      razorpay_order_id: orderId,
      amount: amountMinor,
      amount_in_smallest_unit: amountMinor,
      amount_in_paise: currency === 'INR' ? amountMinor : undefined,
      currency,
      coins: pkg.coins,
      coins_credited: pkg.coins,
      country: body.country ?? 'IN',
      resolved_country: body.country ?? 'IN',
      client_country: body.country ?? null,
    };
  }

  /**
   * Buyer's state for GST place of supply, best signal first:
   * app-provided → IP geolocation → the buyer's previous recharge.
   */
  private async resolvePlaceOfSupply(
    userId: bigint,
    body: { country?: string; state?: string },
    currency: string,
    clientIp?: string,
  ): Promise<{ state: IndianState; source: 'client' | 'ip' | 'previous' } | null> {
    const fromApp = resolveIndianState(body.state);
    if (fromApp) return { state: fromApp, source: 'client' };

    const fromIp = indianStateFromIp(clientIp);
    if (fromIp) return { state: fromIp, source: 'ip' };

    const country = (body.country ?? '').trim().toUpperCase();
    const domestic = currency === 'INR' || country === 'IN' || country === 'IND' || country === 'INDIA';
    if (!domestic) return null;
    const previous = await this.prisma.coinPurchaseTransaction.findFirst({
      where: { userId, state: { not: null } },
      orderBy: { id: 'desc' },
      select: { state: true },
    });
    const carried = resolveIndianState(previous?.state);
    return carried ? { state: carried, source: 'previous' } : null;
  }

  async verifyRecharge(
    userId: bigint,
    body: {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    },
  ) {
    const purchase = await this.prisma.coinPurchaseTransaction.findFirst({
      where: { razorpayOrderId: body.razorpay_order_id, userId },
    });
    if (!purchase) {
      throw new NotFoundException({
        success: false,
        error: { code: 'ORDER_NOT_FOUND', message: 'Order not found' },
      });
    }

    if (purchase.status === 'success') {
      const u = await this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      return {
        status: 'already_credited',
        coins_credited: purchase.coinsCredited,
        coins_added: purchase.coinsCredited,
        wallet_balance: Number(u.walletBalance),
        current_balance: Number(u.walletBalance),
        new_balance: Number(u.walletBalance),
        balances: { coins: Number(u.walletBalance), gems: Number(u.gems) },
      };
    }

    const secret = this.config.get<string>('RAZORPAY_KEY_SECRET');
    if (secret && this.razorpay) {
      const expected = createHmac('sha256', secret)
        .update(`${body.razorpay_order_id}|${body.razorpay_payment_id}`)
        .digest('hex');
      const a = Buffer.from(expected);
      const b = Buffer.from(body.razorpay_signature);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'INVALID_SIGNATURE',
            message: 'Invalid payment signature',
          },
        });
      }
    } else {
      // Mock mode: accept any signature for order_mock_*
      if (!body.razorpay_order_id.startsWith('order_mock_')) {
        throw new ServiceUnavailableException({
          success: false,
          error: {
            code: 'CONFIG_ERROR',
            message: 'Razorpay is not configured',
          },
        });
      }
    }

    const dup = await this.prisma.coinPurchaseTransaction.findFirst({
      where: {
        razorpayPaymentId: body.razorpay_payment_id,
        status: 'success',
      },
    });
    if (dup) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'DUPLICATE_PAYMENT',
          message: 'Payment already processed',
        },
      });
    }

    const balanceAfter = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.coinPurchaseTransaction.updateMany({
        where: { id: purchase.id, status: 'pending' },
        data: {
          status: 'success',
          razorpayPaymentId: body.razorpay_payment_id,
          razorpaySignature: body.razorpay_signature,
        },
      });
      if (claim.count === 0) {
        const u = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        return u.walletBalance;
      }
      const after = await this.ledger.creditCoins(
        tx,
        userId,
        purchase.coinsCredited,
        'RECHARGE',
        'Coin recharge',
        body.razorpay_payment_id,
      );
      return after;
    });

    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    return {
      status: 'success',
      coins_credited: purchase.coinsCredited,
      coins_added: purchase.coinsCredited,
      wallet_balance: Number(balanceAfter),
      current_balance: Number(balanceAfter),
      new_balance: Number(balanceAfter),
      balances: { coins: Number(balanceAfter), gems: Number(u.gems) },
    };
  }

  async purchaseWithEarnings(
    userId: bigint,
    body: { package_id: number | string; country?: string; currency?: string },
  ) {
    const settings = await this.getSettings();
    if (!settings.earningsPurchaseEnabled) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'EARNINGS_PURCHASE_DISABLED',
          message: 'Earnings purchase is disabled',
        },
      });
    }

    const pkg = await this.prisma.coinPackage.findFirst({
      where: { id: BigInt(body.package_id), isActive: true },
    });
    if (!pkg) {
      throw new NotFoundException({
        success: false,
        error: { code: 'PACKAGE_NOT_FOUND', message: 'Package not found' },
      });
    }

    const currency = (body.currency ?? 'INR').toUpperCase();
    const cost = Number(pkg.price);

    return this.prisma.$transaction(async (tx) => {
      const locked = await this.ledger.lockUser(tx, userId);
      if (!locked) throw new NotFoundException('User not found');

      if (currency === 'INR') {
        if (Number(locked.inr_earnings_balance) < cost) {
          throw new BadRequestException({
            success: false,
            error: {
              code: 'INSUFFICIENT_EARNINGS',
              message: 'Insufficient INR earnings balance',
            },
          });
        }
        await tx.user.update({
          where: { id: userId },
          data: { inrEarningsBalance: { decrement: BigInt(Math.round(cost)) } },
        });
      } else if (currency === 'USD') {
        const costMinor = BigInt(Math.round(cost * 100));
        if (locked.usd_earnings_balance < costMinor) {
          throw new BadRequestException({
            success: false,
            error: {
              code: 'INSUFFICIENT_EARNINGS',
              message: 'Insufficient USD earnings balance',
            },
          });
        }
        await tx.user.update({
          where: { id: userId },
          data: { usdEarningsBalance: { decrement: costMinor } },
        });
      } else {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'INVALID_CURRENCY',
            message: 'currency must be INR or USD',
          },
        });
      }

      const after = await this.ledger.creditCoins(
        tx,
        userId,
        pkg.coins,
        'EARNINGS_PURCHASE',
        'Package purchased with earnings',
        `pkg_${pkg.id}_${Date.now()}`,
        locked,
        { source: 'wallet', currency: 'coins', package_id: Number(pkg.id) },
      );

      await tx.coinPurchaseTransaction.create({
        data: {
          userId,
          packageId: pkg.id,
          amountMinor: Math.round(cost * 100),
          currency,
          coinsCredited: pkg.coins,
          status: 'success',
          paymentSource: 'EARNINGS_WALLET',
          country: body.country ?? null,
        },
      });

      const u = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      return {
        coins_added: pkg.coins,
        new_balance: Number(after),
        inr_spent: currency === 'INR' ? cost : undefined,
        usd_spent: currency === 'USD' ? cost : undefined,
        inr_earnings_balance_after: Number(u.inrEarningsBalance),
        usd_earnings_balance_after: Number(u.usdEarningsBalance),
      };
    });
  }

  async transfer(
    senderId: bigint,
    body: {
      receiver_id: number | string;
      coin_amount: number | string;
      note?: string;
    },
  ) {
    const sender = await this.prisma.user.findUniqueOrThrow({
      where: { id: senderId },
    });
    if (sender.role !== 'seller' && sender.role !== 'admin') {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only sellers can transfer coins',
        },
      });
    }

    const receiverId = BigInt(body.receiver_id);
    if (senderId === receiverId) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'SELF_TRANSFER_FORBIDDEN',
          message: 'Cannot transfer coins to yourself',
        },
      });
    }
    const amount = BigInt(body.coin_amount);
    if (amount <= 0n) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'INVALID_AMOUNT',
          message: 'coin_amount must be positive',
        },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      try {
        const userMap = await this.ledger.lockUsers(tx, [senderId, receiverId]);
        const senderLocked = userMap.get(senderId.toString());
        const receiverLocked = userMap.get(receiverId.toString());
        const transferKey = `${senderId}_${receiverId}_${Date.now()}`;
        const { after } = await this.ledger.debitCoins(
          tx,
          senderId,
          amount,
          'SELLER_TRANSFER',
          body.note ?? 'Coin transfer',
          `to_${transferKey}`,
          senderLocked,
          { source: 'wallet', currency: 'coins', receiver_id: Number(receiverId) },
        );
        const recvAfter = await this.ledger.creditCoins(
          tx,
          receiverId,
          amount,
          'SELLER_TRANSFER',
          'Coins received',
          `from_${transferKey}`,
          receiverLocked,
          { source: 'wallet', currency: 'coins', sender_id: Number(senderId) },
        );
        const row = await tx.coinTransaction.findFirst({
          where: { userId: senderId, type: 'SELLER_TRANSFER' },
          orderBy: { id: 'desc' },
        });
        return {
          transaction_id: `TRX_${row?.id ?? Date.now()}`,
          sender_balance_after: Number(after),
          receiver_id: Number(receiverId),
          coin_amount: Number(amount),
          receiver_wallet_balance_after: Number(recvAfter),
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
              code: 'USER_NOT_FOUND',
              message: 'User not found',
            },
          });
        }
        throw e;
      }
    });
  }

  async convertReferral(userId: bigint) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await this.ledger.lockUser(tx, userId);
      if (!locked) throw new NotFoundException('User not found');
      const amount = locked.referral_balance;
      if (amount <= 0n) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'NOTHING_TO_CONVERT',
            message: 'No referral balance to convert',
          },
        });
      }
      await tx.user.update({
        where: { id: userId },
        data: { referralBalance: 0 },
      });
      const after = await this.ledger.creditCoins(
        tx,
        userId,
        amount,
        'REFERRAL_CONVERT',
        'Referral balance converted',
        `referral_convert_${userId}_${Date.now()}`,
        locked,
        { source: 'referral', currency: 'coins' },
      );
      return {
        referral_balance: 0,
        wallet_balance: Number(after),
        coins: Number(after),
      };
    });
  }

  async convertGems(
    userId: bigint,
    body: { gems_amount: number | string; currency?: string },
  ) {
    const currency = (body.currency ?? 'COINS').toUpperCase();
    if (currency !== 'COINS') {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'CONVERT_TO_FIAT_DISABLED',
          message: 'Fiat conversion is disabled. Convert gems to coins only.',
        },
      });
    }

    const settings = await this.getSettings();
    const gemsAmount = BigInt(body.gems_amount);
    const gemsPerCoin = Number(settings.gemsPerCoin);
    if (gemsAmount < BigInt(settings.minGemsConvertToCoins)) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'BELOW_MINIMUM',
          message: `Minimum ${settings.minGemsConvertToCoins} gems required`,
        },
      });
    }
    const coins = BigInt(Math.floor(Number(gemsAmount) / gemsPerCoin));
    if (coins <= 0n) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'INVALID_AMOUNT',
          message: 'Not enough gems for 1 coin',
        },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const locked = await this.ledger.lockUser(tx, userId);
      if (!locked) throw new NotFoundException('User not found');
      if (locked.gems < gemsAmount) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'INSUFFICIENT_GEMS',
            message: 'Insufficient gems',
          },
        });
      }
      await tx.user.update({
        where: { id: userId },
        data: { gems: { decrement: gemsAmount } },
      });
      const walletAfter = await this.ledger.creditCoins(
        tx,
        userId,
        coins,
        'GEM_TO_COINS',
        'Gems converted to coins',
        `gems_convert_${userId}_${Date.now()}`,
        locked,
        {
          source: 'wallet',
          currency: 'coins',
          gems: Number(gemsAmount),
          gems_delta: -Number(gemsAmount),
          gems_after: Number(locked.gems - gemsAmount),
        },
      );
      const gemsAfter = locked.gems - gemsAmount;
      await tx.gemConversion.create({
        data: {
          userId,
          gemsDebited: gemsAmount,
          currency: 'COINS',
          coinsCredited: coins,
          gemsBalanceAfter: gemsAfter,
          walletBalanceAfter: walletAfter,
          gemsPerCoin: settings.gemsPerCoin,
        },
      });
      return {
        gems_debited: Number(gemsAmount),
        currency: 'COINS',
        coins_credited: Number(coins),
        gems_balance_after: Number(gemsAfter),
        wallet_balance_after: Number(walletAfter),
        coins_balance_after: Number(walletAfter),
        gems_per_coin: gemsPerCoin,
      };
    });
  }

  async gemConversions(userId: bigint) {
    const rows = await this.prisma.gemConversion.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => ({
      id: Number(r.id),
      gems_debited: Number(r.gemsDebited),
      currency: r.currency,
      coins_credited: Number(r.coinsCredited),
      gems_balance_after: Number(r.gemsBalanceAfter),
      wallet_balance_after: r.walletBalanceAfter
        ? Number(r.walletBalanceAfter)
        : null,
      gems_per_coin: Number(r.gemsPerCoin),
      created_at: r.createdAt.toISOString(),
    }));
  }

  async transactions(userId: bigint, page = 1, limit = 20, filter?: string) {
    const take = Math.min(Math.max(limit, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;
    const where: {
      userId: bigint;
      coinAmount?: { gt: bigint } | { lt: bigint };
    } = { userId };
    if (filter === 'earned') where.coinAmount = { gt: 0n };
    if (filter === 'expense') where.coinAmount = { lt: 0n };

    const [rows, purchases] = await Promise.all([
      this.prisma.coinTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.coinPurchaseTransaction.findMany({
        where: { userId, status: 'success' },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    const ledger = rows.map((r) => ({
      id: `ctx_${r.id}`,
      type: r.type,
      title: r.title,
      coin_amount: Number(r.coinAmount),
      net_amount: r.netAmount !== null ? Number(r.netAmount) : null,
      commission_amount:
        r.commissionAmount !== null ? Number(r.commissionAmount) : null,
      status: r.status,
      created_at: r.createdAt.toISOString(),
    }));

    const recharges = purchases.map((p) => ({
      id: `cpt_${p.id}`,
      type: 'RECHARGE',
      title: 'Coin purchase',
      coin_amount: p.coinsCredited,
      net_amount: p.coinsCredited,
      commission_amount: 0,
      status: p.status,
      currency: p.currency,
      amount_paid: p.amountMinor / 100,
      created_at: p.createdAt.toISOString(),
    }));

    const merged = [...ledger, ...recharges].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    return merged.slice(0, take);
  }

  async earningsConfig() {
    const s = await this.getSettings();
    return {
      cashout_enabled: s.cashoutEnabled,
      gems_per_coin: Number(s.gemsPerCoin),
      min_gems_convert_to_coins: s.minGemsConvertToCoins,
      gems_per_rupee: 1,
      min_gems_convert: s.minGemsConvertToCoins,
      min_inr_withdrawal: 0,
      max_inr_withdrawal: 0,
      gems_per_dollar: 1,
      min_gems_convert_usd: s.minGemsConvertToCoins,
      min_usd_withdrawal: 0,
      max_usd_withdrawal: 0,
      earnings_purchase_enabled: s.earningsPurchaseEnabled,
    };
  }

  async withdrawLimits() {
    const s = await this.getSettings();
    return {
      cashout_enabled: s.cashoutEnabled,
      min_inr_withdrawal: 0,
      max_inr_withdrawal: 0,
      min_usd_withdrawal: 0,
      max_usd_withdrawal: 0,
    };
  }

  async withdraw() {
    throw new ForbiddenException({
      success: false,
      error: {
        code: 'CASH_OUT_DISABLED',
        message:
          'Withdrawals are no longer available. Convert gems to coins instead.',
      },
    });
  }

  async withdrawals(userId: bigint) {
    const rows = await this.prisma.withdrawalRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: Number(r.id),
      amount: Number(r.amount),
      currency: r.currency,
      withdrawal_source: r.source,
      status: r.status,
      created_at: r.createdAt.toISOString(),
    }));
  }

  async sendGift(
    senderId: bigint,
    body: {
      gift_id: number | string;
      receiver_id: number | string;
      quantity?: number;
      gift_name?: string;
    },
  ) {
    if (!body?.gift_id || !body?.receiver_id) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'gift_id and receiver_id are required',
        },
      });
    }

    const rawGiftName = body.gift_name ? String(body.gift_name).trim() : '';
    const rawGiftId = body.gift_id != null ? String(body.gift_id).trim() : '';

    let gift = null;
    if (rawGiftId && !isNaN(Number(rawGiftId))) {
      try {
        gift = await this.prisma.gift.findFirst({
          where: { id: BigInt(rawGiftId), isActive: true },
        });
      } catch {
        // ignore
      }
    }
    if (!gift && rawGiftName) {
      gift = await this.prisma.gift.findFirst({
        where: { name: { equals: rawGiftName, mode: 'insensitive' }, isActive: true },
      });
    }
    if (!gift && rawGiftName) {
      gift = await this.prisma.gift.findFirst({
        where: { name: { contains: rawGiftName, mode: 'insensitive' }, isActive: true },
      });
    }

    if (!gift) {
      throw new NotFoundException({
        success: false,
        error: { code: 'GIFT_NOT_FOUND', message: 'Gift not found' },
      });
    }
    const receiverId = BigInt(body.receiver_id);
    const quantity = Math.min(Math.max(Number(body.quantity ?? 1), 1), 100);
    const settings = await this.getSettings();
    const commissionPct = Number(settings.giftCommissionPct) / 100;
    const cost = BigInt(gift.coinCost * quantity);
    const commission = BigInt(Math.floor(Number(cost) * commissionPct));
    const netGems = cost - commission;

    return this.prisma.$transaction(async (tx) => {
      try {
        const userMap = await this.ledger.lockUsers(tx, [senderId, receiverId]);
        const recv = userMap.get(receiverId.toString());
        const sender = userMap.get(senderId.toString());
        if (!recv) {
          throw new NotFoundException({
            success: false,
            error: {
              code: 'RECEIVER_NOT_FOUND',
              message: 'Receiver not found',
            },
          });
        }
        const ref = `gift_${gift.id}_to_${receiverId}_${senderId}_${Date.now()}`;
        const { after: afterDebit, locked: senderAfterDebit } = await this.ledger.debitCoins(
          tx,
          senderId,
          cost,
          'GIFT',
          `Gift: ${gift.name}`,
          ref,
          sender,
          {
            source: 'gift',
            currency: 'coins',
            gift_id: Number(gift.id),
            receiver_id: Number(receiverId),
            quantity,
          },
          'gift',
        );
        await this.ledger.writeLedger(tx, {
          userId: senderId,
          type: 'GIFT',
          title: `Gift commission`,
          coinAmount: 0,
          commissionAmount: commission,
          netAmount: netGems,
          balanceAfter: afterDebit,
        });

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
          source: 'dm_gift',
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
          source: 'dm',
          roomId: null,
        });

        return {
          transaction_id: ref,
          gift_id: Number(gift.id),
          coin_cost: Number(cost),
          coin_amount: Number(cost),
          sender_balance_after: Number(after),
          receiver_gems_after: Number(receiverGemsAfter),
          lucky_rebate: luckyRebate
            ? { pct: luckyRebate.pct, coins: luckyRebate.coins }
            : null,
          balances: {
            coins: Number(after),
            gems: Number(
              (await tx.user.findUniqueOrThrow({ where: { id: senderId } }))
                .gems,
            ),
          },
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
  }

  async listGifts() {
    const publicBase = this.config.get<string>(
      'PUBLIC_BASE_URL',
      this.config.get<string>('APP_PUBLIC_URL', 'https://chataura.in'),
    );
    await ensureCpAffectionGiftCatalog(this.prisma, publicBase);
    await ensureExtraGiftCatalogs(this.prisma, publicBase);

    let gifts = await this.prisma.gift.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    });
    if (gifts.length === 0) {
      await this.prisma.gift.createMany({
        data: [
          { name: 'Rose', coinCost: 10, category: 'standard', imageUrl: null },
          { name: 'Heart', coinCost: 50, category: 'standard', imageUrl: null },
          { name: 'Diamond', coinCost: 100, category: 'standard', imageUrl: null },
          { name: 'Crown', coinCost: 500, category: 'standard', imageUrl: null },
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
          name: g.name,
          coin_cost: g.coinCost,
          category: normalizeGiftCategory(g.category),
          ...catalogClientFields(cleanImg, cleanAnim),
        };
      }),
    };
  }

  async canCall(userId: bigint, receiverId: bigint, callType: string) {
    const settings = await this.getSettings();
    const price =
      callType === 'video'
        ? settings.videoCallPricePerMin
        : settings.audioCallPricePerMin;
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const balance = Number(u.walletBalance);
    void receiverId;
    return {
      can_call: false,
      max_minutes: 0,
      price_per_min: price,
      wallet_balance: balance,
      message: '1-1 audio and video calls are disabled',
    };
  }

  @Cron('*/1 * * * *')
  async handleReconcileCron() {
    try {
      await this.reconcilePendingPayments();
    } catch (e) {
      this.logger.warn(`Payment reconcile cron error: ${describeError(e)}`);
    }
  }

  /**
   * Backstop for orders the app never verified. Walks pending orders
   * least-recently-checked first (each check bumps updated_at), so abandoned
   * orders can't starve newer ones.
   */
  async reconcilePendingPayments(olderThanMinutes = 2, limit = 50) {
    if (!this.razorpay) {
      return { checked: 0, success: 0, failed: 0, review: 0 };
    }

    const threshold = new Date(Date.now() - olderThanMinutes * 60_000);
    const pendingOrders = await this.prisma.coinPurchaseTransaction.findMany({
      where: {
        status: 'pending',
        paymentSource: 'RAZORPAY',
        razorpayOrderId: { not: null },
        createdAt: { lte: threshold },
        // captured-but-pending is flagged for admin review — nothing more the cron can do
        OR: [{ gatewayStatus: null }, { gatewayStatus: { not: 'captured' } }],
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });

    const totals = { checked: 0, success: 0, failed: 0, review: 0 };
    for (const order of pendingOrders) {
      totals.checked++;
      try {
        const payments = await this.razorpay.orders.fetchPayments(order.razorpayOrderId!);
        const outcome = await this.applyGatewayPayments(order, ((payments as any)?.items ?? []) as RazorpayPayment[], {
          allowAutoCredit: true,
        });
        if (outcome === 'credited') totals.success++;
        else if (outcome === 'failed') totals.failed++;
        else if (outcome === 'review') totals.review++;
      } catch (err) {
        await this.prisma.coinPurchaseTransaction
          .update({ where: { id: order.id }, data: { gatewaySyncedAt: new Date() } })
          .catch(() => undefined);
        this.logger.warn(`Reconciliation check failed for order ${order.razorpayOrderId}: ${describeError(err)}`);
      }
    }
    return totals;
  }

  /**
   * Applies what Razorpay reports for an order's payments:
   *  - stores the payment details (method, vpa, bank, card, rrn, fee…)
   *  - captured + recent      → credit coins (when allowAutoCredit)
   *  - captured + old/no-auto → keep pending, flag for admin review
   *  - all attempts failed    → failed
   *  - no attempt after 24h   → failed (abandoned checkout)
   */
  async applyGatewayPayments(
    order: { id: bigint; userId: bigint; status: string; createdAt: Date; coinsCredited: number; razorpayPaymentId: string | null },
    items: RazorpayPayment[],
    opts: { allowAutoCredit: boolean },
  ): Promise<'credited' | 'review' | 'failed' | 'unchanged'> {
    const now = new Date();
    const captured = items.find((p) => p.status === 'captured' || p.status === 'refunded');
    const chosen =
      captured ??
      items.find((p) => p.status === 'authorized') ??
      [...items].sort((a, b) => Number(b.created_at ?? 0) - Number(a.created_at ?? 0))[0];

    const ageMs = now.getTime() - order.createdAt.getTime();
    const base = {
      gatewaySyncedAt: now,
      ...(chosen
        ? {
            gatewayStatus: String(chosen.status).slice(0, 24),
            paymentMethod: chosen.method ? String(chosen.method).slice(0, 24) : null,
            gatewayData: gatewayDetails(chosen, items.length) as Prisma.InputJsonValue,
          }
        : { gatewayStatus: 'no_attempt' }),
    };

    if (order.status === 'success') {
      await this.prisma.coinPurchaseTransaction.update({ where: { id: order.id }, data: base });
      return 'unchanged';
    }

    if (captured && captured.status === 'captured') {
      const paymentId = String(captured.id);
      const alreadyUsed = await this.prisma.coinPurchaseTransaction.findFirst({
        where: { razorpayPaymentId: paymentId, status: 'success', NOT: { id: order.id } },
        select: { id: true },
      });
      const autoCredit = opts.allowAutoCredit && !alreadyUsed && ageMs <= AUTO_CREDIT_WINDOW_MS;
      if (!autoCredit) {
        // Old or ambiguous capture: an admin decides (credit vs. already compensated).
        await this.prisma.coinPurchaseTransaction.update({
          where: { id: order.id },
          data: { ...base, razorpayPaymentId: alreadyUsed ? order.razorpayPaymentId : paymentId },
        });
        return 'review';
      }
      let credited = false;
      await this.prisma.$transaction(async (tx) => {
        const claim = await tx.coinPurchaseTransaction.updateMany({
          where: { id: order.id, status: { in: ['pending', 'failed'] } },
          data: { ...base, status: 'success', razorpayPaymentId: paymentId },
        });
        if (claim.count === 0) return;
        await this.ledger.creditCoins(tx, order.userId, order.coinsCredited, 'RECHARGE', 'Coin recharge (reconciled)', paymentId);
        credited = true;
      });
      if (credited) {
        this.logger.log(`Reconciliation credited purchase #${order.id} (${paymentId}) with ${order.coinsCredited} coins`);
      }
      return credited ? 'credited' : 'unchanged';
    }

    const allFailed = items.length > 0 && items.every((p) => p.status === 'failed' || p.status === 'cancelled');
    const abandoned = items.length === 0 && ageMs > ABANDONED_AFTER_MS;
    if (order.status === 'pending' && (allFailed || abandoned)) {
      await this.prisma.coinPurchaseTransaction.update({ where: { id: order.id }, data: { ...base, status: 'failed' } });
      return 'failed';
    }

    await this.prisma.coinPurchaseTransaction.update({ where: { id: order.id }, data: base });
    return 'unchanged';
  }

  /** Admin review: credit coins for a captured payment the system never credited. */
  async creditCapturedPurchase(id: bigint) {
    const order = await this.prisma.coinPurchaseTransaction.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Recharge not found');
    if (order.status === 'success') throw new BadRequestException('This recharge is already marked successful');
    if (order.gatewayStatus !== 'captured' || !order.razorpayPaymentId) {
      throw new BadRequestException('Razorpay has not confirmed a captured payment for this order — sync first');
    }
    const paymentId = order.razorpayPaymentId;
    const [dup, ledgerDup] = await Promise.all([
      this.prisma.coinPurchaseTransaction.findFirst({ where: { razorpayPaymentId: paymentId, status: 'success', NOT: { id } } }),
      this.prisma.coinTransaction.findFirst({ where: { type: 'RECHARGE', referenceId: paymentId } }),
    ]);
    if (dup || ledgerDup) throw new BadRequestException('Coins for this payment were already credited');

    let after: bigint | null = null;
    await this.prisma.$transaction(async (tx) => {
      const claim = await tx.coinPurchaseTransaction.updateMany({
        where: { id, status: { in: ['pending', 'failed'] } },
        data: { status: 'success' },
      });
      if (claim.count === 0) throw new BadRequestException('Recharge was updated by someone else — refresh');
      after = await this.ledger.creditCoins(tx, order.userId, order.coinsCredited, 'RECHARGE', 'Coin recharge (admin reviewed)', paymentId);
    });
    return { credited_coins: order.coinsCredited, wallet_balance: after !== null ? Number(after) : null };
  }

  /** Admin review: payment was captured but the buyer was compensated another way — record revenue, no coins. */
  async markCapturedPurchasePaid(id: bigint, note?: string) {
    const order = await this.prisma.coinPurchaseTransaction.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Recharge not found');
    if (order.status === 'success') throw new BadRequestException('This recharge is already marked successful');
    if (order.gatewayStatus !== 'captured') {
      throw new BadRequestException('Razorpay has not confirmed a captured payment for this order — sync first');
    }
    const data = (order.gatewayData as Record<string, unknown>) ?? {};
    await this.prisma.coinPurchaseTransaction.update({
      where: { id },
      data: {
        status: 'success',
        gatewayData: {
          ...data,
          admin_resolution: 'paid_without_credit',
          admin_note: (note ?? '').slice(0, 500) || null,
          resolved_at: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });
    return { message: 'Marked as paid without crediting coins' };
  }

  get razorpayClient() {
    return this.razorpay;
  }
}

type RazorpayPayment = {
  id: string;
  status: string;
  order_id?: string | null;
  amount?: number;
  currency?: string;
  method?: string | null;
  created_at?: number;
  [k: string]: any;
};

/** Captured payments older than this are not auto-credited; an admin reviews them. */
const AUTO_CREDIT_WINDOW_MS = 72 * 60 * 60 * 1000;
/** A Razorpay order with no payment attempt after this long is an abandoned checkout. */
const ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000;

export function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  try {
    const o = e as any;
    return o?.error?.description ? `${o.statusCode ?? ''} ${o.error.description}`.trim() : JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/** The useful, non-secret parts of a Razorpay payment entity. */
export function gatewayDetails(p: RazorpayPayment, attempts: number) {
  const email = p.email && p.email !== 'void@razorpay.com' ? p.email : null;
  return {
    payment_id: p.id,
    order_id: p.order_id ?? null,
    status: p.status,
    method: p.method ?? null,
    amount: typeof p.amount === 'number' ? p.amount / 100 : null,
    currency: p.currency ?? null,
    contact: p.contact || null,
    email,
    vpa: p.vpa ?? p.upi?.vpa ?? null,
    upi_flow: p.upi?.flow ?? null,
    bank: p.bank ?? null,
    wallet: p.wallet ?? null,
    card_network: p.card?.network ?? null,
    card_issuer: p.card?.issuer ?? null,
    card_type: p.card?.type ?? null,
    card_last4: p.card?.last4 ?? null,
    card_country: p.card?.country ?? null,
    international: p.international ?? null,
    rrn: p.acquirer_data?.rrn ?? null,
    bank_transaction_id: p.acquirer_data?.bank_transaction_id ?? null,
    fee: typeof p.fee === 'number' ? p.fee / 100 : null,
    tax: typeof p.tax === 'number' ? p.tax / 100 : null,
    amount_refunded: typeof p.amount_refunded === 'number' ? p.amount_refunded / 100 : null,
    refund_status: p.refund_status ?? null,
    error_code: p.error_code ?? null,
    error_description: p.error_description ?? null,
    error_reason: p.error_reason ?? null,
    description: p.description ?? null,
    notes: p.notes && typeof p.notes === 'object' ? p.notes : null,
    paid_at: p.created_at ? new Date(p.created_at * 1000).toISOString() : null,
    attempts,
  };
}

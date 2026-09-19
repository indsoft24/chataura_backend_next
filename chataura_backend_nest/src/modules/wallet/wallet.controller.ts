import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { WalletService } from './wallet.service';

@Controller()
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get(['users/me/wallet', 'users/me/balance'])
  balance(@CurrentUser() user: AuthUser) {
    return this.wallet.balance(user.id);
  }

  @Get('wallet/packages')
  packages(@Query('country') country?: string) {
    return this.wallet.packages(country);
  }

  @Public()
  @Get('packages')
  packagesLegacy(@Query('country') country?: string) {
    return this.wallet.packages(country);
  }

  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @Post('wallet/recharge/initiate')
  initiate(
    @CurrentUser() user: AuthUser,
    @Body()
    body: { package_id: number | string; country?: string; currency?: string },
  ) {
    return this.wallet.initiateRecharge(user.id, body);
  }

  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @Post('create-payment')
  initiateLegacy(
    @CurrentUser() user: AuthUser,
    @Body()
    body: { package_id: number | string; country?: string; currency?: string },
  ) {
    return this.wallet.initiateRecharge(user.id, body);
  }

  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @Post('verify-payment')
  verifyLegacy(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    },
  ) {
    return this.wallet.verifyRecharge(user.id, body);
  }

  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @Post('wallet/recharge/verify')
  verify(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    },
  ) {
    return this.wallet.verifyRecharge(user.id, body);
  }

  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @Post(['wallet/purchase-with-earnings', 'purchase-with-earnings'])
  purchaseWithEarnings(
    @CurrentUser() user: AuthUser,
    @Body()
    body: { package_id: number | string; country?: string; currency?: string },
  ) {
    return this.wallet.purchaseWithEarnings(user.id, body);
  }

  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @Post('wallet/transfer')
  transfer(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      receiver_id: number | string;
      coin_amount: number | string;
      note?: string;
    },
  ) {
    return this.wallet.transfer(user.id, body);
  }

  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @Post('wallet/referral/convert')
  convertReferral(@CurrentUser() user: AuthUser) {
    return this.wallet.convertReferral(user.id);
  }

  @Get('wallet/earnings/config')
  earningsConfig() {
    return this.wallet.earningsConfig();
  }

  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @Post('wallet/gems/convert')
  convertGems(
    @CurrentUser() user: AuthUser,
    @Body() body: { gems_amount: number | string; currency?: string },
  ) {
    return this.wallet.convertGems(user.id, body);
  }

  @Get('wallet/gems/conversions')
  gemConversions(@CurrentUser() user: AuthUser) {
    return this.wallet.gemConversions(user.id);
  }

  @Get(['wallet/transactions', 'users/me/transactions'])
  transactions(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('filter') filter?: string,
  ) {
    return this.wallet.transactions(
      user.id,
      Number(page ?? 1),
      Number(limit ?? 20),
      filter,
    );
  }

  @Get('wallet/withdraw/limits')
  withdrawLimits() {
    return this.wallet.withdrawLimits();
  }

  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @Post('wallet/withdraw')
  withdraw() {
    return this.wallet.withdraw();
  }

  @Get('wallet/withdrawals')
  withdrawals(@CurrentUser() user: AuthUser) {
    return this.wallet.withdrawals(user.id);
  }

  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @Post('wallet/send-gift')
  sendGift(
    @CurrentUser() user: AuthUser,
    @Body() body: { gift_id: number | string; receiver_id: number | string },
  ) {
    return this.wallet.sendGift(user.id, body);
  }

  @Get('gifts')
  gifts() {
    return this.wallet.listGifts();
  }

  @Get('wallet/can-call/:receiverId/:callType')
  canCall(
    @CurrentUser() user: AuthUser,
    @Param('receiverId') receiverId: string,
    @Param('callType') callType: string,
  ) {
    return this.wallet.canCall(user.id, BigInt(receiverId), callType);
  }
}

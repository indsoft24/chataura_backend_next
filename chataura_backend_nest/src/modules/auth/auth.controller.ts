import { Body, Controller, Headers, HttpCode, Post, Res } from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import type { FastifyReply } from 'fastify';
import { Public } from '../../common/decorators/public.decorator';
import { SkipEmailVerified } from '../../common/decorators/skip-email-verified.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { normalizeDeviceId } from './session.rules';
import { cookieValue, TRUSTED_COOKIE, TRUSTED_DEVICE_DAYS } from './panel-2fa.rules';
import { FcmService } from '../../common/fcm/fcm.service';
import {
  ChangePasswordRequestDto,
  ChangePasswordVerifyDto,
  ForgotPasswordDto,
  GoogleLoginDto,
  LoginDto,
  PanelOtpResendDto,
  PanelOtpVerifyDto,
  RefreshTokenDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailOtpDto,
} from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly fcm: FcmService,
  ) {}

  /**
   * Firebase custom token (uid = account id) for Firestore room / direct chat. `token` is null
   * when the server has no Firebase signing credentials; the app then keeps working unsigned.
   */
  @SkipEmailVerified()
  @Throttle({ default: { limit: 20, ttl: seconds(60) } })
  @Post('firebase-token')
  async firebaseToken(@CurrentUser() user: AuthUser) {
    const token = await this.fcm.createCustomToken(user.id);
    return { token, uid: String(user.id) };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @Post('register')
  register(@Body() dto: RegisterDto, @Headers('x-device-id') deviceId?: string) {
    return this.auth.register(dto, normalizeDeviceId(deviceId));
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @Post('login')
  login(
    @Body() dto: LoginDto,
    @Headers('x-device-id') deviceId?: string,
    @Headers('x-client') client?: string,
    @Headers('cookie') cookie?: string,
  ) {
    return this.auth.login(
      dto,
      normalizeDeviceId(deviceId),
      client === 'admin-panel',
      cookieValue(cookie, TRUSTED_COOKIE),
    );
  }

  /** Admin panel step 2: the emailed code. A trusted browser's cookie is HttpOnly, so page scripts never see it. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @Post('panel-otp/verify')
  async panelOtpVerify(
    @Body() dto: PanelOtpVerifyDto,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const { payload, trustToken } = await this.auth.panelOtpVerify(
      dto.challenge_id,
      dto.code,
      dto.trust_device === true,
      userAgent,
    );
    if (trustToken) {
      res.header(
        'Set-Cookie',
        `${TRUSTED_COOKIE}=${trustToken}; Max-Age=${TRUSTED_DEVICE_DAYS * 86400}; Path=/; HttpOnly; Secure; SameSite=Strict`,
      );
    }
    return payload;
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @Post('panel-otp/resend')
  panelOtpResend(@Body() dto: PanelOtpResendDto) {
    return this.auth.panelOtpResend(dto.challenge_id);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @Post('google')
  google(@Body() dto: GoogleLoginDto, @Headers('x-device-id') deviceId?: string) {
    return this.auth.google(dto, normalizeDeviceId(deviceId));
  }

  @Public()
  @Throttle({ default: { limit: 15, ttl: seconds(60) } })
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refresh(dto);
  }

  @Public()
  @Throttle({ default: { limit: 15, ttl: seconds(60) } })
  @Post('logout')
  logout(@Body() dto: RefreshTokenDto) {
    return this.auth.logout(dto);
  }

  @SkipEmailVerified()
  @Throttle({ default: { limit: 3, ttl: seconds(60) } })
  @Post('send-email-otp')
  sendEmailOtp(@CurrentUser() user: AuthUser) {
    return this.auth.sendEmailOtp(user.id);
  }

  @SkipEmailVerified()
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @Post('verify-email-otp')
  verifyEmailOtp(
    @CurrentUser() user: AuthUser,
    @Body() dto: VerifyEmailOtpDto,
  ) {
    return this.auth.verifyEmailOtp(user.id, dto);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: seconds(60) } })
  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Res({ passthrough: false }) res: FastifyReply,
  ) {
    const result = await this.auth.forgotPassword(dto);
    const { _raw, _status, ...body } = result as Record<string, unknown>;
    void _raw;
    return res.status(Number(_status ?? 200)).send(body);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: seconds(60) } })
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Res({ passthrough: false }) res: FastifyReply,
  ) {
    const result = await this.auth.resetPassword(dto);
    const { _raw, _status, ...body } = result as Record<string, unknown>;
    void _raw;
    return res.status(Number(_status ?? 200)).send(body);
  }

  @Throttle({ default: { limit: 3, ttl: seconds(60) } })
  @Post('change-password/request')
  async changePasswordRequest(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordRequestDto,
    @Res({ passthrough: false }) res: FastifyReply,
  ) {
    const result = await this.auth.changePasswordRequest(user.id, dto);
    const { _raw, _status, ...body } = result as Record<string, unknown>;
    void _raw;
    return res.status(Number(_status ?? 200)).send(body);
  }

  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @Post('change-password/verify')
  async changePasswordVerify(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordVerifyDto,
    @Res({ passthrough: false }) res: FastifyReply,
  ) {
    const result = await this.auth.changePasswordVerify(user.id, dto);
    const { _raw, _status, ...body } = result as Record<string, unknown>;
    void _raw;
    return res.status(Number(_status ?? 200)).send(body);
  }
}

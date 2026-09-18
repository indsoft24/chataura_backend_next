import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { Public } from '../../common/decorators/public.decorator';
import { SkipEmailVerified } from '../../common/decorators/skip-email-verified.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import {
  ChangePasswordRequestDto,
  ChangePasswordVerifyDto,
  ForgotPasswordDto,
  GoogleLoginDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailOtpDto,
} from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Post('google')
  google(@Body() dto: GoogleLoginDto) {
    return this.auth.google(dto);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refresh(dto);
  }

  @Public()
  @Post('logout')
  logout(@Body() dto: RefreshTokenDto) {
    return this.auth.logout(dto);
  }

  @SkipEmailVerified()
  @Post('send-email-otp')
  sendEmailOtp(@CurrentUser() user: AuthUser) {
    return this.auth.sendEmailOtp(user.id);
  }

  @SkipEmailVerified()
  @Post('verify-email-otp')
  verifyEmailOtp(
    @CurrentUser() user: AuthUser,
    @Body() dto: VerifyEmailOtpDto,
  ) {
    return this.auth.verifyEmailOtp(user.id, dto);
  }

  @Public()
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

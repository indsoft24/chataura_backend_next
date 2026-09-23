import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { userForApi } from '../user/user.serializer';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';
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
import { User } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly otp: OtpService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          errors: { email: ['The email has already been taken.'] },
        },
      });
    }

    const referralCode = dto.referral_code ?? dto.invite_code ?? null;
    let invitedBy: bigint | null = null;
    if (referralCode) {
      const referrer = await this.prisma.user.findUnique({
        where: { inviteCode: referralCode },
      });
      if (referrer) invitedBy = referrer.id;
    }

    const displayName = dto.display_name ?? dto.name ?? email.split('@')[0];
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const inviteCode = await this.uniqueInviteCode();

    const user = await this.prisma.user.create({
      data: {
        email,
        password: passwordHash,
        name: displayName,
        displayName,
        inviteCode,
        invitedBy,
        country: dto.country ?? null,
        lastClientCountry: dto.country ?? null,
        level: 1,
        exp: 0,
        xp: 0,
      },
    });

    if (invitedBy) {
      await this.grantReferralCoins(user.id, invitedBy);
    }

    return this.authPayload(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          ...(dto.email ? [{ email: dto.email.toLowerCase() }] : []),
          ...(dto.phone ? [{ phone: dto.phone }] : []),
        ],
      },
    });

    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid phone/email or password',
        },
      });
    }

    this.assertAccountActive(user);

    if (dto.country) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          lastClientCountry: dto.country,
          country: user.country ?? dto.country,
        },
      });
    }

    return this.authPayload(user);
  }

  async google(dto: GoogleLoginDto) {
    const payload = await this.verifyGoogleIdToken(dto.id_token);
    if (!payload?.email) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'INVALID_ID_TOKEN',
          message: 'Invalid or expired Google ID token',
        },
      });
    }

    const email = String(payload.email).toLowerCase();
    let user = await this.prisma.user.findUnique({ where: { email } });
    let isNew = false;

    if (!user) {
      isNew = true;
      const name = String(payload.name ?? email);
      const passwordHash = await bcrypt.hash(
        randomBytes(24).toString('hex'),
        10,
      );
      const emailVerified =
        payload.email_verified === undefined
          ? true
          : Boolean(
              payload.email_verified === true ||
              payload.email_verified === 'true',
            );

      user = await this.prisma.user.create({
        data: {
          email,
          name,
          displayName: name,
          avatarUrl: payload.picture ? String(payload.picture) : null,
          password: passwordHash,
          inviteCode: await this.uniqueInviteCode(),
          emailVerifiedAt: emailVerified ? new Date() : null,
          country: dto.country ?? null,
          lastClientCountry: dto.country ?? null,
        },
      });

      if (emailVerified) {
        await this.grantSignupBonus(user.id);
        user = (await this.prisma.user.findUnique({ where: { id: user.id } }))!;
      }
    } else {
      this.assertAccountActive(user);
      if (!user.emailVerifiedAt) {
        const verified =
          payload.email_verified === undefined
            ? true
            : Boolean(
                payload.email_verified === true ||
                payload.email_verified === 'true',
              );
        if (verified) {
          user = await this.prisma.user.update({
            where: { id: user.id },
            data: { emailVerifiedAt: new Date() },
          });
        }
      }
    }

    void isNew;
    return this.authPayload(user);
  }

  async refresh(dto: RefreshTokenDto) {
    const user = await this.tokens.verifyRefreshToken(dto.refresh_token);
    if (!user) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Invalid or expired refresh token',
        },
      });
    }
    this.assertAccountActive(user);

    if (dto.country) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastClientCountry: dto.country },
      });
    }

    const access_token = this.tokens.generateAccessToken(user);
    const refresh_token = await this.tokens.generateRefreshToken(user);
    return {
      access_token,
      refresh_token,
      expires_in: this.tokens.getAccessExpiresIn(),
    };
  }

  async logout(dto: RefreshTokenDto) {
    await this.tokens.revokeRefreshToken(dto.refresh_token);
    return { message: 'Logged out successfully' };
  }

  async sendEmailOtp(userId: bigint) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (!user.email) {
      throw new BadRequestException({
        success: false,
        error: { code: 'NO_EMAIL', message: 'User has no email address' },
      });
    }

    const code = this.otp.generateOtp();
    await this.otp.store(
      `email_otp:email_verification:${userId}`,
      code,
      15 * 60,
    );
    const result = await this.otp.sendEmail(user.email, code);
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    return !isProd && result.devOtp
      ? { message: 'OTP sent', dev_otp: result.devOtp }
      : null;
  }

  async verifyEmailOtp(userId: bigint, dto: VerifyEmailOtpDto) {
    const ok = await this.otp.verify(
      `email_otp:email_verification:${userId}`,
      dto.otp,
    );
    if (!ok) {
      throw new BadRequestException({
        success: false,
        error: { code: 'INVALID_OTP', message: 'Invalid or expired OTP' },
      });
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const wasVerified = !!user.emailVerifiedAt;
    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });

    if (!wasVerified) {
      const bonus = await this.grantSignupBonus(userId);
      if (bonus) return { signup_bonus: bonus };
    }
    return null;
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.toLowerCase();
    const attempts = await this.otp.incrRate(
      `forgot_password_rate:${email}`,
      600,
    );
    if (attempts > 3) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many attempts. Please try again in 10 minutes.',
        },
      });
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      return { success: true, message: 'OTP sent to your email', _raw: true };
    }

    const code = this.otp.generateOtp();
    await this.otp.store(`email_otp:forgot_password:${email}`, code, 600);
    const result = await this.otp.sendEmail(user.email!, code);
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    return {
      success: true,
      message: 'OTP sent to your email',
      ...(!isProd && result.devOtp ? { dev_otp: result.devOtp } : {}),
      _raw: true,
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const email = dto.email.toLowerCase();
    const ok = await this.otp.verify(
      `email_otp:forgot_password:${email}`,
      dto.otp,
    );
    if (!ok) {
      return {
        success: false,
        message: 'Invalid or expired OTP',
        _raw: true,
        _status: 400,
      };
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      return {
        success: false,
        message: 'Invalid or expired OTP',
        _raw: true,
        _status: 400,
      };
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: await bcrypt.hash(dto.password, 10) },
    });

    return {
      success: true,
      message: 'Password reset successfully',
      _raw: true,
    };
  }

  async changePasswordRequest(userId: bigint, dto: ChangePasswordRequestDto) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (!user.email) {
      throw new BadRequestException({
        success: false,
        error: { code: 'NO_EMAIL', message: 'User has no email address' },
      });
    }

    const code = this.otp.generateOtp();
    const pendingHash = await bcrypt.hash(dto.new_password, 10);
    await this.otp.store(`email_otp:change_password:${userId}`, code, 600);
    await this.otp.store(`change_password_pending:${userId}`, pendingHash, 600);
    const result = await this.otp.sendEmail(user.email, code);
    const isProd = this.config.get('NODE_ENV') === 'production';
    return {
      success: true,
      message: 'OTP sent to your registered email',
      ...(!isProd && result.devOtp ? { dev_otp: result.devOtp } : {}),
      _raw: true,
    };
  }

  async changePasswordVerify(userId: bigint, dto: ChangePasswordVerifyDto) {
    const storedOtp = await this.otp.get(`email_otp:change_password:${userId}`);
    const pendingHash = await this.otp.get(`change_password_pending:${userId}`);
    if (!storedOtp || storedOtp !== dto.otp) {
      return {
        success: false,
        message: 'Invalid or expired OTP',
        _raw: true,
        _status: 400,
      };
    }
    if (
      !pendingHash ||
      !(await bcrypt.compare(dto.new_password, pendingHash))
    ) {
      await this.otp.del(`email_otp:change_password:${userId}`);
      await this.otp.del(`change_password_pending:${userId}`);
      return {
        success: false,
        message: 'Invalid or expired OTP',
        _raw: true,
        _status: 400,
      };
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: pendingHash },
    });
    await this.otp.del(`email_otp:change_password:${userId}`);
    await this.otp.del(`change_password_pending:${userId}`);
    await this.tokens.revokeAllForUser(userId);

    return {
      success: true,
      message: 'Password changed successfully',
      _raw: true,
    };
  }

  private async authPayload(user: User) {
    const withFrame = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: { selectedFrame: true },
    });
    const access_token = this.tokens.generateAccessToken(user);
    const refresh_token = await this.tokens.generateRefreshToken(user);
    return {
      user: userForApi(withFrame ?? user, withFrame?.selectedFrame),
      access_token,
      refresh_token,
      expires_in: this.tokens.getAccessExpiresIn(),
    };
  }

  private assertAccountActive(user: User) {
    if (user.isSuspended || user.accountStatus === 'suspended') {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'ACCOUNT_SUSPENDED',
          message: 'Your account has been suspended.',
        },
      });
    }
    if (user.deletedAt || user.accountStatus === 'deleted') {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'ACCOUNT_DELETED',
          message: 'This account has been deleted.',
        },
      });
    }
  }

  private async uniqueInviteCode(): Promise<string> {
    for (let i = 0; i < 20; i++) {
      const code = randomBytes(4).toString('hex');
      const exists = await this.prisma.user.findUnique({
        where: { inviteCode: code },
      });
      if (!exists) return code;
    }
    return randomBytes(6).toString('hex');
  }

  private async grantSignupBonus(userId: bigint) {
    const coins = Number(this.config.get('SIGNUP_BONUS_COINS', '50'));
    if (coins <= 0) return null;
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        coinBalance: { increment: coins },
        walletBalance: { increment: coins },
      },
    });
    await this.prisma.coinTransaction.create({
      data: {
        userId,
        type: 'BONUS',
        title: 'Signup bonus',
        coinAmount: BigInt(coins),
        balanceAfter: undefined,
        status: 'success',
      },
    });
    return { coins, bonus_type: 'signup' };
  }

  async grantReferralCoins(inviteeId: bigint, referrerId: bigint) {
    const referee = Number(this.config.get('REFERRAL_REWARD_REFEREE', '50'));
    const referrerAmt = Number(
      this.config.get('REFERRAL_REWARD_REFERRER', '100'),
    );
    return this.prisma.$transaction(async (tx) => {
      if (referee > 0) {
        const refKey = `referral_join_${inviteeId}`;
        const already = await tx.coinTransaction.findFirst({
          where: { userId: inviteeId, referenceId: refKey },
        });
        if (!already) {
          const u = await tx.user.update({
            where: { id: inviteeId },
            data: {
              coinBalance: { increment: referee },
              walletBalance: { increment: referee },
            },
          });
          await tx.coinTransaction.create({
            data: {
              userId: inviteeId,
              type: 'REFERRAL_REFEREE',
              title: 'Referral join bonus',
              coinAmount: BigInt(referee),
              balanceAfter: u.walletBalance,
              status: 'success',
              referenceId: refKey,
            },
          });
        }
      }
      if (referrerAmt > 0) {
        const refBonusKey = `ref_bonus_${inviteeId}`;
        const already = await tx.coinTransaction.findFirst({
          where: { userId: referrerId, referenceId: refBonusKey },
        });
        if (!already) {
          const u = await tx.user.update({
            where: { id: referrerId },
            data: {
              coinBalance: { increment: referrerAmt },
              walletBalance: { increment: referrerAmt },
            },
          });
          await tx.coinTransaction.create({
            data: {
              userId: referrerId,
              type: 'REFERRAL_REFERRER',
              title: 'Referral invite bonus',
              coinAmount: BigInt(referrerAmt),
              balanceAfter: u.walletBalance,
              status: 'success',
              referenceId: refBonusKey,
            },
          });
        }
      }
      return { invitee_coins: referee, referrer_coins: referrerAmt };
    });
  }

  private async creditSpendable(
    userId: bigint,
    coins: number,
    type: string,
    title: string,
  ) {
    const u = await this.prisma.user.update({
      where: { id: userId },
      data: {
        coinBalance: { increment: coins },
        walletBalance: { increment: coins },
      },
    });
    await this.prisma.coinTransaction.create({
      data: {
        userId,
        type,
        title,
        coinAmount: BigInt(coins),
        balanceAfter: u.walletBalance,
        status: 'success',
      },
    });
  }

  private async verifyGoogleIdToken(
    idToken: string,
  ): Promise<Record<string, unknown> | null> {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const isProd = this.config.get('NODE_ENV') === 'production';
    if (!clientId) {
      if (isProd) {
        throw new UnauthorizedException({
          code: 'AUTH_CONFIG_ERROR',
          message: 'Google authentication is not configured in production',
        });
      }
      // Dev fallback: decode JWT payload without signature when GOOGLE_CLIENT_ID unset
      try {
        const parts = idToken.split('.');
        if (parts.length < 2) return null;
        const json = Buffer.from(parts[1], 'base64url').toString('utf8');
        return JSON.parse(json) as Record<string, unknown>;
      } catch {
        return null;
      }
    }

    try {
      const url = new URL('https://oauth2.googleapis.com/tokeninfo');
      url.searchParams.set('id_token', idToken);
      const res = await fetch(url);
      if (!res.ok) return null;
      const payload = (await res.json()) as Record<string, unknown>;
      if (payload.aud !== clientId) return null;
      return payload;
    } catch {
      return null;
    }
  }
}

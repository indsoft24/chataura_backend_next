import { withUniqueDisplayId } from '../user/display-id';
import { OnlinePresenceService } from '../../common/presence/online-presence.service';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { userForApi } from '../user/user.serializer';
import { UserService } from '../user/user.service';
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
import { canCreateAccount, canUseDevice, PANEL_SESSION, readMaxAccountsPerDevice } from './session.rules';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly otp: OtpService,
    private readonly config: ConfigService,
    private readonly online: OnlinePresenceService,
    private readonly users: UserService,
  ) {}

  async register(dto: RegisterDto, deviceId: string | null = null) {
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

    const invitedBy = await this.resolveReferrerId(
      dto.referral_code ?? dto.invite_code,
    );

    await this.assertDeviceCanCreateAccount(deviceId);

    const displayName = dto.display_name ?? dto.name ?? email.split('@')[0];
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const inviteCode = await this.uniqueInviteCode();

    const user = await withUniqueDisplayId(this.prisma, (displayId) => this.prisma.user.create({
      data: {
        email,
        password: passwordHash,
        name: displayName,
        displayName,
        inviteCode,
        displayId,
        invitedBy,
        country: dto.country ?? null,
        lastClientCountry: dto.country ?? null,
        level: 1,
        exp: 0,
        xp: 0,
      },
    }));

    await this.recordDevice(user.id, deviceId);
    if (invitedBy) {
      await this.grantReferralCoins(user.id, invitedBy);
      // Also grant the standard signup bonus for the new user (idempotent via ledger check below).
      await this.grantSignupBonus(user.id);
    }

    return this.authPayload(user);
  }

  async login(dto: LoginDto, deviceId: string | null = null, panel = false) {
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

    if (panel) return this.panelPayload(user);
    await this.assertDeviceAllowsLogin(user, deviceId);
    await this.recordDevice(user.id, deviceId);
    return this.authPayload(user);
  }

  async google(dto: GoogleLoginDto, deviceId: string | null = null) {
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
      await this.assertDeviceCanCreateAccount(deviceId);
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

      const invitedBy = await this.resolveReferrerId(
        dto.referral_code ?? dto.invite_code,
      );

      const inviteCode = await this.uniqueInviteCode();
      user = await withUniqueDisplayId(this.prisma, (displayId) => this.prisma.user.create({
        data: {
          email,
          name,
          displayName: name,
          avatarUrl: payload.picture ? String(payload.picture) : null,
          password: passwordHash,
          inviteCode,
          displayId,
          invitedBy,
          emailVerifiedAt: emailVerified ? new Date() : null,
          country: dto.country ?? null,
          lastClientCountry: dto.country ?? null,
        },
      }));

      await this.recordDevice(user.id, deviceId);
      if (invitedBy) {
        await this.grantReferralCoins(user.id, invitedBy);
      }
      if (emailVerified) {
        await this.grantSignupBonus(user.id);
        user = (await this.prisma.user.findUnique({ where: { id: user.id } }))!;
      }
    } else {
      this.assertAccountActive(user);
      await this.assertDeviceAllowsLogin(user, deviceId);
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
    await this.recordDevice(user.id, deviceId);
    return this.authPayload(user);
  }

  async refresh(dto: RefreshTokenDto) {
    const found = await this.tokens.verifyRefreshToken(dto.refresh_token);
    if (!found) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Invalid or expired refresh token',
        },
      });
    }
    const { user } = found;
    this.assertAccountActive(user);

    let sessionId = found.sessionId;
    if (sessionId == null && user.currentSessionId == null) {
      // Token from before single-session: the first phone to refresh claims the account.
      sessionId = await this.tokens.startSession(user.id);
    } else if (sessionId == null || sessionId !== user.currentSessionId) {
      await this.tokens.revokeRefreshToken(dto.refresh_token);
      throw this.sessionReplaced();
    }

    if (dto.country) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastClientCountry: dto.country },
      });
    }

    const access_token = this.tokens.generateAccessToken(user, sessionId);
    const refresh_token = await this.tokens.generateRefreshToken(user, sessionId);
    void this.online.touch(user.id);
    return {
      access_token,
      refresh_token,
      expires_in: this.tokens.getAccessExpiresIn(),
    };
  }

  async logout(dto: RefreshTokenDto) {
    const owner = await this.tokens.userIdForRefreshToken(dto.refresh_token);
    await this.tokens.revokeRefreshToken(dto.refresh_token);
    if (owner) {
      await this.tokens.endSession(owner.userId, owner.sessionId);
      await this.online.markOffline(owner.userId);
    }
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

  private sessionReplaced() {
    return new UnauthorizedException({
      success: false,
      error: { code: 'SESSION_REPLACED', message: 'Your account was logged in on another device.' },
    });
  }

  /** Normal accounts made on this phone so far; staff accounts never count. */
  private async assertDeviceCanCreateAccount(deviceId: string | null) {
    // Apps older than 1.6.0 send no device id; letting them sign up skipped the cap and the bonus check.
    if (!deviceId) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'APP_UPDATE_REQUIRED', message: 'Please update Chat Aura from the Play Store to create a new account.' },
      });
    }
    const max = await this.maxAccountsPerDevice();
    const existing = await this.prisma.authDevice.count({
      where: { deviceId, user: { role: 'user' } },
    });
    if (!canCreateAccount(existing, max)) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'DEVICE_ACCOUNT_LIMIT',
          message: `This phone already has ${existing} accounts. Please log in to one of them.`,
        },
      });
    }
  }

  /** A phone already used by `max` other normal accounts cannot open a further one. */
  private async assertDeviceAllowsLogin(user: User, deviceId: string | null) {
    if (!deviceId || user.role !== 'user') return; // old app: no id to check; staff are never capped
    const max = await this.maxAccountsPerDevice();
    const first = await this.prisma.authDevice.findMany({
      where: { deviceId, user: { role: 'user' } },
      orderBy: [{ firstSeenAt: 'asc' }, { id: 'asc' }],
      select: { userId: true },
      take: max,
    });
    if (!canUseDevice(user.id, first.map((d) => d.userId), max)) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'DEVICE_ACCOUNT_LIMIT',
          message: `Only ${max} accounts can be used on one phone. Please log in to one of them.`,
        },
      });
    }
  }

  private async maxAccountsPerDevice() {
    const settings = await this.prisma.adminSetting.findUnique({ where: { id: 1 } });
    return readMaxAccountsPerDevice(settings?.extraSettings as Record<string, unknown> | null);
  }

  private async recordDevice(userId: bigint, deviceId: string | null) {
    if (!deviceId) return;
    await this.prisma.authDevice.upsert({
      where: { deviceId_userId: { deviceId, userId } },
      create: { deviceId, userId },
      update: { lastSeenAt: new Date() },
    });
  }

  /** Admin panel login: its own token channel, so it never logs the admin out of their phone. */
  private panelPayload(user: User) {
    if (user.role !== 'admin') {
      throw new ForbiddenException({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Admin role required' },
      });
    }
    return {
      user: userForApi(user),
      access_token: this.tokens.generateAccessToken(user, PANEL_SESSION),
      expires_in: this.tokens.getAccessExpiresIn(),
    };
  }

  private async authPayload(user: User) {
    const withFrame = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: { selectedFrame: true, selectedRoleFrame: true },
    });
    const sessionId = await this.tokens.startSession(user.id);
    const access_token = this.tokens.generateAccessToken(user, sessionId);
    const refresh_token = await this.tokens.generateRefreshToken(user, sessionId);
    return {
      user: userForApi(withFrame ?? user, withFrame?.selectedFrame, withFrame?.selectedRoleFrame),
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

  /**
   * Resolve a referral/invite code to the referrer's id. Codes are lowercase hex, but
   * clients have sent them uppercased (caps keyboard) or padded — match trimmed and
   * case-insensitively so a valid code is never silently dropped at signup.
   */
  private async resolveReferrerId(
    rawCode: string | null | undefined,
  ): Promise<bigint | null> {
    const code = String(rawCode ?? '').trim();
    if (!code) return null;
    const referrer = await this.prisma.user.findFirst({
      where: { inviteCode: { equals: code, mode: 'insensitive' } },
      select: { id: true },
    });
    if (!referrer) {
      this.logger.warn(`Signup referral code not found: "${code}"`);
    }
    return referrer?.id ?? null;
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
    if (!(await this.users.isFirstAccountOnDevice(userId))) return null;
    const already = await this.prisma.coinTransaction.findFirst({
      where: { userId, referenceId: `signup_bonus_${userId}` },
    });
    if (already) return null;
    await this.prisma.user.update({
      where: { id: userId },
      data: {
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
        referenceId: `signup_bonus_${userId}`,
      },
    });
    return { coins, bonus_type: 'signup' };
  }

  private async grantReferralCoins(inviteeId: bigint, referrerId: bigint) {
    if (!(await this.users.referralEligible(inviteeId, referrerId))) {
      // Unpaid invites must not count toward the referrer's total or milestone.
      await this.prisma.user.update({ where: { id: inviteeId }, data: { invitedBy: null } });
      return null;
    }
    return this.prisma.$transaction((tx) => this.users.payReferral(tx, inviteeId, referrerId));
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

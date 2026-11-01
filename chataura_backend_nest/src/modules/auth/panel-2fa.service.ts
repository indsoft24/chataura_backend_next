import { HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import type { User } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { tierOf } from '../../common/admin-tier';
import { OtpService } from './otp.service';
import {
  hashCode,
  hashToken,
  maskEmail,
  newToken,
  otpRecipients,
  sameHash,
  PANEL_OTP_MAX_ATTEMPTS,
  PANEL_OTP_MAX_RESENDS,
  PANEL_OTP_RESEND_AFTER_SECONDS,
  PANEL_OTP_SENDS_PER_HOUR,
  PANEL_OTP_TTL_SECONDS,
  PANEL_PASSWORD_FAILS,
  TRUSTED_DEVICE_DAYS,
  TRUSTED_DEVICE_MAX,
} from './panel-2fa.rules';

type Challenge = { uid: string; h: string; sentAt: number; resends: number };

/** Second step of admin-panel sign-in: an emailed one-time code, with optional 30-day trusted browsers. */
@Injectable()
export class Panel2faService {
  private readonly logger = new Logger(Panel2faService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly otp: OtpService,
  ) {}

  /** Off only by setting PANEL_OTP_REQUIRED=false on the server (emergency switch if mail is down). */
  enabled(): boolean {
    return this.config.get<string>('PANEL_OTP_REQUIRED', 'true') !== 'false';
  }

  private get secret(): string {
    return this.config.get<string>('JWT_SECRET', 'change-me-to-a-long-random-secret');
  }

  private tooMany(message: string): HttpException {
    return new HttpException(
      { success: false, error: { code: 'TOO_MANY_REQUESTS', message } },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private invalid(): UnauthorizedException {
    return new UnauthorizedException({
      success: false,
      error: { code: 'INVALID_OTP', message: 'Invalid or expired code. Sign in again.' },
    });
  }

  /** Counts a wrong password; throws once an email has had too many in 15 minutes. */
  async guardPassword(email: string): Promise<void> {
    const n = Number((await this.redis.getClient().get(`p2fa:f:${email}`)) ?? 0);
    if (n >= PANEL_PASSWORD_FAILS) this.throwLocked();
  }

  async passwordFailed(email: string): Promise<void> {
    const c = this.redis.getClient();
    const k = `p2fa:f:${email}`;
    const n = await c.incr(k);
    if (n === 1) await c.expire(k, 900);
  }

  async passwordOk(email: string): Promise<void> {
    await this.redis.getClient().del(`p2fa:f:${email}`);
  }

  private throwLocked(): never {
    throw this.tooMany('Too many wrong passwords. Try again in 15 minutes.');
  }

  /** Password was right: create a code, email it, and hand back the challenge to answer. */
  async start(user: User) {
    const c = this.redis.getClient();
    const sends = await c.incr(`p2fa:s:${user.id}`);
    if (sends === 1) await c.expire(`p2fa:s:${user.id}`, 3600);
    if (sends > PANEL_OTP_SENDS_PER_HOUR) throw this.tooMany('Too many codes requested. Try again later.');

    const id = randomBytes(32).toString('hex');
    const sent = await this.sendNew(id, user, 0);
    return {
      otp_required: true,
      challenge_id: id,
      expires_in: PANEL_OTP_TTL_SECONDS,
      resend_after: PANEL_OTP_RESEND_AFTER_SECONDS,
      sent_to: sent.map(maskEmail),
    };
  }

  /** Where this account's emailed codes go: the superadmin's to the owner mailboxes, everyone else's to their own. */
  recipientsFor(user: User): string[] {
    return otpRecipients(
      tierOf(user.role, user.staffBadgeType) === 'superadmin',
      user.email,
      this.config.get<string>('PANEL_OTP_EMAILS'),
    );
  }

  private async sendNew(id: string, user: User, resends: number): Promise<string[]> {
    const to = this.recipientsFor(user);
    if (to.length === 0) throw new ServiceUnavailableException({ success: false, error: { code: 'NO_EMAIL', message: 'This account has no email for the code.' } });
    const code = this.otp.generateOtp();
    const ch: Challenge = { uid: String(user.id), h: hashCode(this.secret, id, code), sentAt: Date.now(), resends };
    const c = this.redis.getClient();
    // Store first, mail second: a failed mail leaves a code nobody holds, which simply expires.
    await c.set(`p2fa:c:${id}`, JSON.stringify(ch), 'EX', PANEL_OTP_TTL_SECONDS);
    await c.del(`p2fa:a:${id}`);
    try {
      await this.otp.sendPanelCode(to, code, PANEL_OTP_TTL_SECONDS / 60, user.email ?? `#${user.id}`);
    } catch (err) {
      this.logger.error(`Panel code mail failed: ${(err as Error).message}`);
      await c.del(`p2fa:c:${id}`);
      throw new ServiceUnavailableException({ success: false, error: { code: 'EMAIL_FAILED', message: 'Could not send the code. Try again shortly.' } });
    }
    return to;
  }

  private async load(id: string): Promise<Challenge | null> {
    if (!/^[0-9a-f]{64}$/.test(id)) return null;
    const raw = await this.redis.getClient().get(`p2fa:c:${id}`);
    return raw ? (JSON.parse(raw) as Challenge) : null;
  }

  async resend(id: string) {
    const ch = await this.load(id);
    if (!ch) throw this.invalid();
    const wait = PANEL_OTP_RESEND_AFTER_SECONDS * 1000 - (Date.now() - ch.sentAt);
    if (wait > 0) throw this.tooMany(`Wait ${Math.ceil(wait / 1000)} seconds before asking for another code.`);
    if (ch.resends >= PANEL_OTP_MAX_RESENDS) throw this.tooMany('No more resends for this sign-in. Sign in again.');
    const c = this.redis.getClient();
    const sends = await c.incr(`p2fa:s:${ch.uid}`);
    if (sends === 1) await c.expire(`p2fa:s:${ch.uid}`, 3600);
    if (sends > PANEL_OTP_SENDS_PER_HOUR) throw this.tooMany('Too many codes requested. Try again later.');
    const user = await this.prisma.user.findUnique({ where: { id: BigInt(ch.uid) } });
    if (!user) throw this.invalid();
    const sent = await this.sendNew(id, user, ch.resends + 1);
    return { challenge_id: id, expires_in: PANEL_OTP_TTL_SECONDS, resend_after: PANEL_OTP_RESEND_AFTER_SECONDS, sent_to: sent.map(maskEmail) };
  }

  /** Checks the code; returns the account id it was issued for. A code works once, with 5 guesses in total. */
  async verify(id: string, code: string): Promise<bigint> {
    const ch = await this.load(id);
    if (!ch) throw this.invalid();
    const c = this.redis.getClient();
    const tries = await c.incr(`p2fa:a:${id}`);
    if (tries === 1) await c.expire(`p2fa:a:${id}`, PANEL_OTP_TTL_SECONDS);
    if (tries > PANEL_OTP_MAX_ATTEMPTS) {
      await c.del(`p2fa:c:${id}`);
      throw this.invalid();
    }
    if (!sameHash(ch.h, hashCode(this.secret, id, code))) throw this.invalid();
    // GETDEL-style single use: only the request that deletes the key wins a race.
    if ((await c.del(`p2fa:c:${id}`)) !== 1) throw this.invalid();
    await c.del(`p2fa:a:${id}`);
    return BigInt(ch.uid);
  }

  async isTrusted(userId: bigint, token: string | null): Promise<boolean> {
    if (!token || !/^[0-9a-f]{64}$/.test(token)) return false;
    const row = await this.prisma.panelTrustedDevice.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!row || row.userId !== userId || row.expiresAt <= new Date()) return false;
    await this.prisma.panelTrustedDevice.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
    return true;
  }

  /** Remember this browser for 30 days; returns the secret to put in its cookie. */
  async trust(userId: bigint, userAgent: string | undefined): Promise<string> {
    const token = newToken();
    const now = new Date();
    await this.prisma.panelTrustedDevice.deleteMany({ where: { userId, expiresAt: { lte: now } } });
    const live = await this.prisma.panelTrustedDevice.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { id: true } });
    const drop = live.slice(TRUSTED_DEVICE_MAX - 1).map((d) => d.id);
    if (drop.length) await this.prisma.panelTrustedDevice.deleteMany({ where: { id: { in: drop } } });
    await this.prisma.panelTrustedDevice.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        userAgent: userAgent?.slice(0, 255) ?? null,
        expiresAt: new Date(now.getTime() + TRUSTED_DEVICE_DAYS * 86_400_000),
      },
    });
    return token;
  }

  /** Password changed or reset: every remembered browser must prove itself again. */
  async revokeAll(userId: bigint): Promise<void> {
    await this.prisma.panelTrustedDevice.deleteMany({ where: { userId } });
  }
}

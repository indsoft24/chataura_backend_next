import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { RedisService } from '../../common/redis/redis.service';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  generateOtp(): string {
    return String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
  }

  async store(key: string, otp: string, ttlSeconds: number): Promise<void> {
    const client = this.redis.getClient();
    if (client.status !== 'ready') {
      await client.connect().catch(() => undefined);
    }
    await client.set(key, otp, 'EX', ttlSeconds);
  }

  async verify(key: string, otp: string): Promise<boolean> {
    const client = this.redis.getClient();
    if (client.status !== 'ready') {
      await client.connect().catch(() => undefined);
    }
    const stored = await client.get(key);
    if (!stored || stored !== otp) return false;
    await client.del(key);
    return true;
  }

  async get(key: string): Promise<string | null> {
    const client = this.redis.getClient();
    if (client.status !== 'ready') {
      await client.connect().catch(() => undefined);
    }
    return client.get(key);
  }

  async del(key: string): Promise<void> {
    const client = this.redis.getClient();
    if (client.status !== 'ready') {
      await client.connect().catch(() => undefined);
    }
    await client.del(key);
  }

  async incrRate(key: string, ttlSeconds: number): Promise<number> {
    const client = this.redis.getClient();
    if (client.status !== 'ready') {
      await client.connect().catch(() => undefined);
    }
    const n = await client.incr(key);
    if (n === 1) await client.expire(key, ttlSeconds);
    return n;
  }

  async sendEmail(to: string, otp: string): Promise<{ sent: boolean; devOtp?: string }> {
    const host = this.config.get<string>('SMTP_HOST');
    if (!host) {
      this.logger.warn(`SMTP unset — OTP for ${to}: ${otp}`);
      return { sent: true, devOtp: otp };
    }

    const transporter = nodemailer.createTransport({
      host,
      port: Number(this.config.get('SMTP_PORT', '587')),
      secure: false,
      auth: {
        user: this.config.get('SMTP_USER'),
        pass: this.config.get('SMTP_PASS'),
      },
    });

    await transporter.sendMail({
      from: this.config.get('SMTP_FROM', 'noreply@chataura.local'),
      to,
      subject: 'Your ChatAura verification code',
      text: `Your verification code is ${otp}. It expires in 15 minutes.`,
    });
    return { sent: true };
  }
}

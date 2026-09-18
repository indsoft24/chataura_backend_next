import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { User } from '@prisma/client';

@Injectable()
export class TokenService {
  private readonly accessTtl: number;
  private readonly refreshTtl: number;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.accessTtl = Number(this.config.get('JWT_ACCESS_TTL_SECONDS', '3600'));
    this.refreshTtl = Number(
      this.config.get('JWT_REFRESH_TTL_SECONDS', '2592000'),
    );
  }

  getAccessExpiresIn(): number {
    return this.accessTtl;
  }

  generateAccessToken(user: User): string {
    return this.jwt.sign(
      {
        sub: user.id.toString(),
        type: 'access',
        role: user.role,
      },
      { expiresIn: this.accessTtl },
    );
  }

  verifyAccessToken(token: string): { sub: string; type?: string } | null {
    try {
      const payload = this.jwt.verify<{ sub: string; type?: string }>(token);
      if (payload.type && payload.type !== 'access') return null;
      return payload;
    } catch {
      return null;
    }
  }

  async generateRefreshToken(user: User): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const hashed = this.hashToken(token);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: hashed,
        expiresAt: new Date(Date.now() + this.refreshTtl * 1000),
      },
    });
    return token;
  }

  async verifyRefreshToken(token: string): Promise<User | null> {
    const hashed = this.hashToken(token);
    const row = await this.prisma.refreshToken.findFirst({
      where: {
        token: hashed,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });
    return row?.user ?? null;
  }

  async revokeRefreshToken(token: string): Promise<boolean> {
    const hashed = this.hashToken(token);
    const result = await this.prisma.refreshToken.deleteMany({
      where: { token: hashed },
    });
    return result.count > 0;
  }

  async revokeAllForUser(userId: bigint): Promise<void> {
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

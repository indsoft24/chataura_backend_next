import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { User } from '@prisma/client';
import { LOGGED_OUT_SESSION, tokenAllowed } from './session.rules';

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

  generateAccessToken(user: User, sessionId: string): string {
    return this.jwt.sign(
      {
        sub: user.id.toString(),
        type: 'access',
        role: user.role,
        sid: sessionId,
      },
      { expiresIn: this.accessTtl },
    );
  }

  verifyAccessToken(token: string): { sub: string; type?: string; sid?: string } | null {
    try {
      const payload = this.jwt.verify<{ sub: string; type?: string; sid?: string }>(token);
      if (payload.type && payload.type !== 'access') return null;
      return payload;
    } catch {
      return null;
    }
  }

  /**
   * New login: this phone becomes the only one allowed on the account. Every other refresh
   * token is dropped and older access tokens stop matching users.current_session_id.
   */
  async startSession(userId: bigint): Promise<string> {
    const sessionId = randomUUID();
    await this.prisma.$transaction([
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
      this.prisma.user.update({ where: { id: userId }, data: { currentSessionId: sessionId } }),
    ]);
    return sessionId;
  }

  /** Logout: no token of that session (or any older one) works afterwards. */
  async endSession(userId: bigint, sessionId: string | null): Promise<void> {
    await this.prisma.user.updateMany({
      where: { id: userId, ...(sessionId ? { currentSessionId: sessionId } : {}) },
      data: { currentSessionId: LOGGED_OUT_SESSION },
    });
  }

  /** Access token check that also requires the token's session to still own the account (sockets). */
  async verifyAccessSession(token: string): Promise<{ sub: string; sid?: string } | null> {
    const payload = this.verifyAccessToken(token);
    if (!payload?.sub) return null;
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(payload.sub) },
      select: { currentSessionId: true, role: true },
    });
    return user && tokenAllowed(payload.sid, user.currentSessionId, user.role) ? payload : null;
  }

  async generateRefreshToken(user: User, sessionId: string): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const hashed = this.hashToken(token);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: hashed,
        sessionId,
        expiresAt: new Date(Date.now() + this.refreshTtl * 1000),
      },
    });
    return token;
  }

  async verifyRefreshToken(token: string): Promise<{ user: User; sessionId: string | null } | null> {
    const hashed = this.hashToken(token);
    const row = await this.prisma.refreshToken.findFirst({
      where: {
        token: hashed,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });
    return row ? { user: row.user, sessionId: row.sessionId } : null;
  }

  async userIdForRefreshToken(token: string): Promise<{ userId: bigint; sessionId: string | null } | null> {
    if (!token) return null;
    const row = await this.prisma.refreshToken.findFirst({
      where: { token: this.hashToken(token) },
      select: { userId: true, sessionId: true },
    });
    return row ?? null;
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

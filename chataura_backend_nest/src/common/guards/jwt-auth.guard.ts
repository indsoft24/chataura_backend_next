import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from '../../modules/auth/token.service';
import { AuthUser } from '../decorators/current-user.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: AuthUser;
    }>();
    const auth = request.headers['authorization'];
    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
      });
    }

    const token = auth.slice('Bearer '.length).trim();
    const payload = this.tokens.verifyAccessToken(token);
    if (!payload?.sub) {
      throw new UnauthorizedException({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
      });
    }

    const userId = BigInt(payload.sub);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt || user.accountStatus === 'deleted') {
      throw new UnauthorizedException({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not found' },
      });
    }
    if (user.isSuspended || user.accountStatus === 'suspended') {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'ACCOUNT_SUSPENDED',
          message: 'Your account has been suspended.',
        },
      });
    }

    request.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerifiedAt: user.emailVerifiedAt,
      accountStatus: user.accountStatus,
      isSuspended: user.isSuspended,
    };
    return true;
  }
}

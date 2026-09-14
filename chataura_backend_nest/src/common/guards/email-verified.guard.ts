import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SKIP_EMAIL_VERIFIED_KEY } from '../decorators/skip-email-verified.decorator';
import { AuthUser } from '../decorators/current-user.decorator';

@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_EMAIL_VERIFIED_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skip) return true;

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!request.user) return true;
    if (!request.user.emailVerifiedAt) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'EMAIL_NOT_VERIFIED',
          message: 'Please verify your email to continue.',
        },
      });
    }
    return true;
  }
}

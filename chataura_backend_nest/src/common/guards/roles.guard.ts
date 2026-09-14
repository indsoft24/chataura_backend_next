import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Phase 1 placeholder — role checks land in Phase 2 with real JWT claims.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }
    const request = context.switchToHttp().getRequest<{
      user?: { role?: string };
    }>();
    const role = request.user?.role;
    if (role && requiredRoles.includes(role)) return true;
    if (role === 'admin' && requiredRoles.includes('agency')) return true;
    throw new ForbiddenException({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Insufficient role' },
    });
  }
}

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { MIN_TIER_KEY } from '../decorators/min-tier.decorator';
import { AdminTier, TIER_RANK, rankOf } from '../admin-tier';

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
    const minTier = this.reflector.getAllAndOverride<AdminTier>(MIN_TIER_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if ((!requiredRoles || requiredRoles.length === 0) && !minTier) {
      return true;
    }
    const request = context.switchToHttp().getRequest<{
      user?: { role?: string; staffBadgeType?: string | null };
    }>();
    const role = request.user?.role;
    const roleOk =
      !requiredRoles ||
      requiredRoles.length === 0 ||
      (role != null && requiredRoles.includes(role)) ||
      (role === 'admin' && requiredRoles.includes('agency'));
    const tierOk =
      !minTier ||
      rankOf(role ?? '', request.user?.staffBadgeType) >= TIER_RANK[minTier];
    if (roleOk && tierOk) return true;
    throw new ForbiddenException({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Insufficient role' },
    });
  }
}

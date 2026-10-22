import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type AuthUser = {
  id: bigint;
  email: string | null;
  role: string;
  staffBadgeType: string | null;
  emailVerifiedAt: Date | null;
  accountStatus: string;
  isSuspended: boolean;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return request.user;
  },
);

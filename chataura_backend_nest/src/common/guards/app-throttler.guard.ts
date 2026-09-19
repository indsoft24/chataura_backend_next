import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // 1. If authenticated user is present, throttle by user ID to prevent IP spoofing / rotation
    if (req?.user?.id) {
      return `usr_${req.user.id}`;
    }

    // 2. Authoritative client IP resolution behind reverse proxy / load balancer
    const headers = req?.headers || {};
    const cfConnectingIp =
      typeof headers['cf-connecting-ip'] === 'string'
        ? headers['cf-connecting-ip']
        : undefined;
    const xRealIp =
      typeof headers['x-real-ip'] === 'string'
        ? headers['x-real-ip']
        : undefined;
    const xForwardedFor =
      typeof headers['x-forwarded-for'] === 'string'
        ? headers['x-forwarded-for']
        : undefined;

    let ip = cfConnectingIp || xRealIp;
    if (!ip && xForwardedFor) {
      ip = xForwardedFor.split(',')[0].trim();
    }
    if (!ip) {
      ip =
        req?.ip ||
        req?.socket?.remoteAddress ||
        req?.raw?.socket?.remoteAddress ||
        '127.0.0.1';
    }

    return `ip_${String(ip).trim()}`;
  }

  protected getRequestResponse(context: ExecutionContext): { req: any; res: any } {
    if (context.getType() === 'ws') {
      const client = context.switchToWs().getClient();
      return {
        req: client?.handshake || client || {},
        res: {
          header: () => {},
          setHeader: () => {},
        },
      };
    }
    return super.getRequestResponse(context);
  }
}

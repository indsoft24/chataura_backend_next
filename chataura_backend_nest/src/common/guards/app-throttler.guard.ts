import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // 1. If authenticated user is present, throttle by user ID to prevent IP spoofing / rotation
    if (req?.user?.id) {
      return `usr_${req.user.id}`;
    }

    // 2. Client IP. Only headers our own nginx sets can be trusted: it overwrites X-Real-IP and appends the
    // real peer as the LAST X-Forwarded-For entry. cf-connecting-ip and the first XFF entry come straight
    // from the client, so using them let anyone dodge the limits (login brute force) by rotating a header.
    const headers = req?.headers || {};
    const xRealIp = typeof headers['x-real-ip'] === 'string' ? headers['x-real-ip'] : undefined;
    const xForwardedFor =
      typeof headers['x-forwarded-for'] === 'string' ? headers['x-forwarded-for'] : undefined;

    let ip = xRealIp;
    if (!ip && xForwardedFor) {
      ip = xForwardedFor.split(',').pop()?.trim();
    }
    if (!ip) {
      ip = req?.socket?.remoteAddress || req?.raw?.socket?.remoteAddress || req?.ip || '127.0.0.1';
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

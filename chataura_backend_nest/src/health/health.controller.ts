import {
  Controller,
  Get,
  HttpStatus,
  Res,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  async check(@Res({ passthrough: true }) reply: FastifyReply) {
    let postgres: 'up' | 'down' = 'down';
    let redis: 'up' | 'down' = 'down';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      postgres = 'up';
    } catch {
      postgres = 'down';
    }

    try {
      const pong = await this.redis.ping();
      redis = pong === 'PONG' ? 'up' : 'down';
    } catch {
      redis = 'down';
    }

    const payload = {
      status: postgres === 'up' && redis === 'up' ? 'ok' : 'degraded',
      service: 'chataura_backend_nest',
      phase: 6,
      checks: { postgres, redis },
      timestamp: new Date().toISOString(),
    };

    if (postgres === 'down' || redis === 'down') {
      reply.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { success: false, data: payload };
    }

    return payload;
  }

  @Public()
  @Get('liveness')
  liveness() {
    return { status: 'ok', uptime: process.uptime() };
  }

  @Public()
  @Get('readiness')
  readiness(@Res({ passthrough: true }) reply: FastifyReply) {
    return this.check(reply);
  }
}

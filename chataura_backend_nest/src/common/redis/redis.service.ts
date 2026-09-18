import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('REDIS_URL');
    if (url) {
      this.client = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
    } else {
      this.client = new Redis({
        host: this.config.get<string>('REDIS_HOST', 'localhost'),
        port: Number(this.config.get<string>('REDIS_PORT', '6379')),
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
    }

    this.client.on('error', (err) => {
      this.logger.warn(`Redis error: ${err.message}`);
    });
  }

  async onModuleInit() {
    if (this.client.status === 'wait' || this.client.status === 'close') {
      await this.client.connect().catch((err: Error) => {
        this.logger.warn(`Redis initial connect failed: ${err.message}`);
      });
    }
  }

  getClient(): Redis {
    return this.client;
  }

  async ping(): Promise<string> {
    if (this.client.status === 'wait' || this.client.status === 'close') {
      await this.client.connect();
    }
    return this.client.ping();
  }

  async onModuleDestroy() {
    if (this.client.status !== 'end') {
      await this.client.quit();
    }
  }
}

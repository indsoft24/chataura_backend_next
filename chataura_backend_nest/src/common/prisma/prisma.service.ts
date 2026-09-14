import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Prisma connected to PostgreSQL');
    } catch (error) {
      this.logger.warn(
        `Prisma connection deferred (DB may be offline): ${String(error)}`,
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

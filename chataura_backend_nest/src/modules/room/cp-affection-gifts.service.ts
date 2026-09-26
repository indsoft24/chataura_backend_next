import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ensureCpAffectionGiftCatalog } from './cp-affection-gifts.catalog';
import { ensureExtraGiftCatalogs } from './extra-gift-catalogs';

@Injectable()
export class CpAffectionGiftsService {
  private readonly log = new Logger(CpAffectionGiftsService.name);
  private ensurePromise: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Idempotent: create missing CP / Lucky / BCP / flag gifts + relationship rules. */
  async ensureCatalog(): Promise<void> {
    if (!this.ensurePromise) {
      this.ensurePromise = this.runEnsure().finally(() => {
        this.ensurePromise = null;
      });
    }
    return this.ensurePromise;
  }

  private async runEnsure(): Promise<void> {
    const publicBase = this.config.get<string>(
      'PUBLIC_BASE_URL',
      this.config.get<string>('APP_PUBLIC_URL', 'https://chataura.in'),
    );
    await ensureCpAffectionGiftCatalog(this.prisma, publicBase);
    await ensureExtraGiftCatalogs(this.prisma, publicBase);
    this.log.debug('Gift catalogs ensured (CP + Lucky + BCP + flags)');
  }
}

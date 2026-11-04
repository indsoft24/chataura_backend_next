import { Controller, Get, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { appUpdateStatus } from './app-version.rules';

/** Lets the app ask "is there a newer build?" before login, so fixes actually reach users. */
@Controller('app')
export class AppVersionController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get('version')
  async version(@Query('code') code?: string) {
    const setting = await this.prisma.adminSetting.findUnique({ where: { id: 1 } });
    return {
      ...appUpdateStatus(Number(code), setting?.extraSettings as Record<string, unknown> | null),
      play_url: this.config.get<string>('PLAY_STORE_URL', 'https://play.google.com/store/apps/details?id=com.chataura.app'),
    };
  }
}

import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { MinTier } from '../../common/decorators/min-tier.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { MusicalChairService } from './musical-chair.service';

@Controller('rooms/:id/musical-chair')
export class MusicalChairController {
  constructor(private readonly mchair: MusicalChairService) {}

  @Get()
  state(@Param('id') id: string) {
    return this.mchair.state(id);
  }

  @Throttle({ default: { limit: 20, ttl: seconds(60) } })
  @Post()
  start(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.mchair.start(user.id, id);
  }

  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @Post('play')
  play(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.mchair.play(user.id, id);
  }

  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @Post('pause')
  pause(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body('seat') seat: number) {
    return this.mchair.pause(user.id, id, seat);
  }

  @Throttle({ default: { limit: 20, ttl: seconds(60) } })
  @Post('end')
  end(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.mchair.end(user.id, id);
  }
}

@Roles('admin')
@Controller('admin/musical-chair')
export class MusicalChairAdminController {
  constructor(private readonly mchair: MusicalChairService) {}

  @MinTier('superadmin')
  @Get()
  async get() {
    return { enabled: await this.mchair.enabled() };
  }

  @MinTier('superadmin')
  @Put()
  set(@CurrentUser() user: AuthUser, @Body('enabled') enabled: unknown) {
    return this.mchair.setEnabled(enabled === true, user.id);
  }
}

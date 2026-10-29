import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { MedalService } from './medal.service';

function parseId(id: string): bigint {
  if (!/^\d{1,18}$/.test(id)) throw new BadRequestException('Invalid id');
  return BigInt(id);
}

@Controller('medals')
export class MedalController {
  constructor(private readonly medals: MedalService) {}

  @Get('me')
  mine(@CurrentUser() user: AuthUser) {
    return this.medals.mine(user.id);
  }

  @Post(':id/wear')
  wear(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.medals.wear(user.id, parseId(id));
  }

  @Post(':id/remove')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.medals.remove(user.id, parseId(id));
  }
}

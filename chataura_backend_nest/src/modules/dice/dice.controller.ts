import { BadRequestException, Controller, Param, Post } from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { DiceService } from './dice.service';

@Controller('rooms/:id/dice')
export class DiceController {
  constructor(private readonly dice: DiceService) {}

  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @Post()
  roll(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.dice.roll(user.id, id);
  }

  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @Post(':rollId/refresh')
  refresh(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('rollId') rollId: string,
  ) {
    if (!/^\d{1,18}$/.test(rollId))
      throw new BadRequestException('Invalid roll id');
    return this.dice.refresh(user.id, id, BigInt(rollId));
  }
}

import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { GameService } from './game.service';

@Controller('game')
export class GameController {
  constructor(private readonly games: GameService) {}

  @Get('greedy/state')
  greedyState(@CurrentUser() user: AuthUser) {
    return this.games.greedyState(user.id);
  }

  @Post('greedy/bet')
  greedyBet(
    @CurrentUser() user: AuthUser,
    @Body() body: { item: string; amount: number },
  ) {
    return this.games.greedyBet(user.id, body.item, Number(body.amount));
  }

  @Post('greedy/quick-bet')
  greedyQuick(
    @CurrentUser() user: AuthUser,
    @Body() body: { type: string; chip_amount: number },
  ) {
    return this.games.greedyQuickBet(
      user.id,
      body.type,
      Number(body.chip_amount),
    );
  }

  @Get('greedy/result')
  greedyResult(
    @CurrentUser() user: AuthUser,
    @Query('round_id') roundId: string,
  ) {
    return this.games.greedyResult(user.id, BigInt(roundId));
  }

  @Get('greedy/history')
  greedyHistory() {
    return this.games.greedyHistory(30);
  }

  @Get('greedy/leaderboard')
  greedyLeaderboard() {
    return this.games.greedyLeaderboard(20);
  }

  @Get('lucky77/state')
  luckyState(@CurrentUser() user: AuthUser) {
    return this.games.luckyState(user.id);
  }

  @Post('lucky77/bet')
  luckyBet(
    @CurrentUser() user: AuthUser,
    @Body() body: { option: string; amount: number },
  ) {
    return this.games.luckyBet(user.id, body.option, Number(body.amount));
  }

  @Get('lucky77/result')
  luckyResult(
    @CurrentUser() user: AuthUser,
    @Query('round_id') roundId: string,
  ) {
    return this.games.luckyResult(user.id, BigInt(roundId));
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RelationshipEngineService } from './relationship-engine.service';
import { RelationshipService } from './relationship.service';

@Controller()
export class RelationshipController {
  constructor(
    private readonly relationships: RelationshipService,
    private readonly engine: RelationshipEngineService,
  ) {}

  @Get('relationship-types')
  listTypes() {
    return this.relationships.listTypes(true);
  }

  @Get('relationships/me')
  myRelationships(
    @CurrentUser() user: { id: bigint },
    @Query('type') type?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.relationships.listMine(user.id, {
      type,
      limit: limit ? Number(limit) : undefined,
      cursor,
    });
  }

  @Get('relationships/broadcasts')
  broadcasts(
    @Query('room_id') roomId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.relationships.broadcasts({
      roomId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('relationships/rings')
  rings(
    @CurrentUser() user: { id: bigint },
    @Query('type') type?: string,
  ) {
    return this.relationships.listRings(user.id, type);
  }

  @Get('relationships/privileges')
  privileges(
    @CurrentUser() user: { id: bigint },
    @Query('type') type = 'cp',
  ) {
    return this.relationships.listPrivileges(user.id, type);
  }

  @Post('relationships/invite')
  invite(
    @CurrentUser() user: { id: bigint },
    @Body() body: { user_id: number | string; type_code: string },
  ) {
    return this.relationships.invite(user.id, body.user_id, body.type_code);
  }

  @Post('relationships/:id/accept')
  accept(
    @CurrentUser() user: { id: bigint },
    @Param('id') id: string,
  ) {
    return this.relationships.accept(user.id, id);
  }

  @Post('relationships/:id/unbind')
  unbind(
    @CurrentUser() user: { id: bigint },
    @Param('id') id: string,
  ) {
    return this.relationships.unbind(user.id, id);
  }

  @Post('rooms/:roomId/relationships/mic-tick')
  micTick(
    @Param('roomId') roomId: string,
    @Body() body: { seated_user_ids?: Array<number | string> },
  ) {
    return this.relationships.micTick(roomId, body.seated_user_ids ?? []);
  }

  @Get('relationships/leaderboard')
  leaderboard(
    @Query('type') type: string,
    @Query('period') period?: string,
    @Query('scope') scope?: string,
    @Query('room_id') roomId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.relationships.leaderboard({
      type: type || 'cp',
      period,
      scope,
      room_id: roomId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('rooms/:roomId/relationships/leaderboard')
  roomLeaderboard(
    @Param('roomId') roomId: string,
    @Query('type') type: string,
    @Query('period') period?: string,
    @Query('limit') limit?: string,
  ) {
    return this.relationships.leaderboard({
      type: type || 'cp',
      period,
      scope: 'room',
      room_id: roomId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('relationships/:id')
  getOne(@Param('id') id: string) {
    return this.relationships.getById(id);
  }

  @Get('users/:userId/relationships')
  userRelationships(
    @Param('userId') userId: string,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
  ) {
    return this.relationships.listForUser(BigInt(userId), {
      type,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('users/:userId/relationships/primary')
  primary(
    @Param('userId') userId: string,
    @Query('type') type?: string,
  ) {
    return this.relationships.primaryForUser(BigInt(userId), type);
  }

  @Roles('admin')
  @Get('admin/relationships/types')
  adminTypes() {
    return this.relationships.adminListTypes();
  }

  @Roles('admin')
  @Put('admin/relationships/types')
  adminUpsertType(
    @Body()
    body: {
      code: string;
      name: string;
      description?: string;
      enabled?: boolean;
      sort_order?: number;
      exclusivity_mode?: string;
      formation_rule?: string;
      requires_accept?: boolean;
      bidirectional_scoring?: boolean;
      quantity_multiplies_points?: boolean;
      levels_enabled?: boolean;
      dm_gifts_count?: boolean;
      room_gifts_count?: boolean;
      visual?: object;
      leaderboard?: object;
      rank1_rewards?: object;
      max_partners?: number | null;
      formation_cost_coins?: number;
      unbind_cost_coins?: number;
      mic_exp_per_tick?: number;
      mic_exp_daily_cap?: number;
    },
  ) {
    return this.relationships.adminUpsertType(body);
  }

  @Roles('admin')
  @Get('admin/relationships/gift-rules')
  adminGiftRules() {
    return this.relationships.adminListGiftRules();
  }

  @Roles('admin')
  @Put('admin/relationships/gift-rules')
  adminUpsertGiftRule(
    @Body()
    body: {
      gift_id: number | string;
      type_code: string;
      point_value: number;
      enabled?: boolean;
    },
  ) {
    return this.relationships.adminUpsertGiftRule(body);
  }

  @Roles('admin')
  @Post('admin/relationships/gift-rules/sync-from-categories')
  adminSyncRules() {
    return this.relationships.adminSyncGiftRules();
  }

  @Roles('admin')
  @Post('admin/relationships/ensure-defaults')
  adminEnsureDefaults() {
    return this.engine.ensureDefaultTypes().then(() => ({ ok: true }));
  }
}

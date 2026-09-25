import { Controller, Get, Param, Query } from '@nestjs/common';
import { FxAssetsService } from './fx-assets.service';

@Controller('fx-assets')
export class FxAssetsController {
  constructor(private readonly fx: FxAssetsService) {}

  @Get()
  list(@Query('category') category?: string) {
    return this.fx.list(category);
  }

  @Get('map')
  map() {
    return this.fx.map();
  }

  @Get(':assetKey')
  getOne(@Param('assetKey') assetKey: string) {
    return this.fx.getOne(assetKey);
  }
}

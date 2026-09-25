import { Module } from '@nestjs/common';
import { FxAssetsController } from './fx-assets.controller';
import { FxAssetsService } from './fx-assets.service';

@Module({
  controllers: [FxAssetsController],
  providers: [FxAssetsService],
  exports: [FxAssetsService],
})
export class FxAssetsModule {}

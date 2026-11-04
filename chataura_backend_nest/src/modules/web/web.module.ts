import { Module } from '@nestjs/common';
import { WebController } from './web.controller';
import { AppVersionController } from './app-version.controller';

@Module({
  controllers: [WebController, AppVersionController],
})
export class WebModule {}

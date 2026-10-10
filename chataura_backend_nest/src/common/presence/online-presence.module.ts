import { Global, Module } from '@nestjs/common';
import { OnlinePresenceService } from './online-presence.service';

@Global()
@Module({
  providers: [OnlinePresenceService],
  exports: [OnlinePresenceService],
})
export class OnlinePresenceModule {}

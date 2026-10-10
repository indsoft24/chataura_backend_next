import { Global, Module } from '@nestjs/common';
import { FcmService } from './fcm.service';
import { RealtimeService } from './realtime.service';

@Global()
@Module({
  providers: [FcmService, RealtimeService],
  exports: [FcmService, RealtimeService],
})
export class FcmModule {}

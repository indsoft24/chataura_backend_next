import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { AuthModule } from '../auth/auth.module';
import { AgoraService } from './agora.service';
import { RoomController } from './room.controller';
import { RoomEvents } from './room.events';
import { RoomGateway } from './room.gateway';
import { PresenceService } from './presence.service';
import { RoomGiftingService } from './room-gifting.service';
import { RoomService } from './room.service';

@Module({
  imports: [WalletModule, AuthModule],
  controllers: [RoomController],
  providers: [
    RoomService,
    PresenceService,
    RoomGiftingService,
    AgoraService,
    RoomEvents,
    RoomGateway,
  ],
  exports: [RoomService, RoomGiftingService],
})
export class RoomModule {}

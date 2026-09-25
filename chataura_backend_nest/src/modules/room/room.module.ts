import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { AuthModule } from '../auth/auth.module';
import { RelationshipModule } from '../relationship/relationship.module';
import { AgoraService } from './agora.service';
import { RoomController } from './room.controller';
import { RoomEvents } from './room.events';
import { RoomGateway } from './room.gateway';
import { PresenceService } from './presence.service';
import { RoomGiftingService } from './room-gifting.service';
import { RocketLaunchService } from './rocket-launch.service';
import { RoomService } from './room.service';
import { CpAffectionGiftsService } from './cp-affection-gifts.service';

@Module({
  imports: [WalletModule, AuthModule, RelationshipModule],
  controllers: [RoomController],
  providers: [
    RoomService,
    PresenceService,
    RoomGiftingService,
    RocketLaunchService,
    CpAffectionGiftsService,
    AgoraService,
    RoomEvents,
    RoomGateway,
  ],
  exports: [RoomService, RoomGiftingService, RocketLaunchService],
})
export class RoomModule {}

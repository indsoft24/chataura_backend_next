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
import { GiftBroadcastService } from './gift-broadcast.service';
import { RocketLaunchService } from './rocket-launch.service';
import { RoomService } from './room.service';
import { CpAffectionGiftsService } from './cp-affection-gifts.service';
import { YouTubeSearchService } from './youtube-search.service';
import { RoomRewardService } from './room-reward/room-reward.service';
import { RoomRewardAdminService } from './room-reward/room-reward-admin.service';
import { MusicalChairModule } from '../musical-chair/musical-chair.module';
import { RoomStateService } from './room-state/room-state.service';

@Module({
  imports: [WalletModule, AuthModule, RelationshipModule, MusicalChairModule],
  controllers: [RoomController],
  providers: [
    RoomService,
    PresenceService,
    RoomGiftingService,
    GiftBroadcastService,
    RocketLaunchService,
    CpAffectionGiftsService,
    YouTubeSearchService,
    RoomRewardService,
    RoomRewardAdminService,
    RoomStateService,
    AgoraService,
    RoomEvents,
    RoomGateway,
  ],
  exports: [RoomService, RoomGiftingService, GiftBroadcastService, RocketLaunchService, YouTubeSearchService, RoomRewardService, RoomRewardAdminService, RoomStateService],
})
export class RoomModule {}

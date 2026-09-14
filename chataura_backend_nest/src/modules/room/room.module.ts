import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { AuthModule } from '../auth/auth.module';
import { AgoraService } from './agora.service';
import { RoomController } from './room.controller';
import { RoomEvents } from './room.events';
import { RoomGateway } from './room.gateway';
import { RoomService } from './room.service';

@Module({
  imports: [WalletModule, AuthModule],
  controllers: [RoomController],
  providers: [RoomService, AgoraService, RoomEvents, RoomGateway],
  exports: [RoomService],
})
export class RoomModule {}

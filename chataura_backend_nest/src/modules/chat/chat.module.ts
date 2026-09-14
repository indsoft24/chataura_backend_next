import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WalletModule } from '../wallet/wallet.module';
import { ChatController } from './chat.controller';
import { ChatEvents } from './chat.events';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';

@Module({
  imports: [WalletModule, AuthModule],
  controllers: [ChatController],
  providers: [ChatService, ChatEvents, ChatGateway],
  exports: [ChatService],
})
export class ChatModule {}

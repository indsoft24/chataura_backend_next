import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { EmailVerifiedGuard } from './common/guards/email-verified.guard';
import { HealthController } from './health/health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { RoomModule } from './modules/room/room.module';
import { GameModule } from './modules/game/game.module';
import { ChatModule } from './modules/chat/chat.module';
import { CallModule } from './modules/call/call.module';
import { MediaModule } from './modules/media/media.module';
import { AgencyModule } from './modules/agency/agency.module';
import { GamificationModule } from './modules/gamification/gamification.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    AuthModule,
    UserModule,
    WalletModule,
    RoomModule,
    GameModule,
    ChatModule,
    CallModule,
    MediaModule,
    AgencyModule,
    GamificationModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: EmailVerifiedGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { FcmModule } from './common/fcm/fcm.module';
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
import { ThrottlerModule, seconds } from '@nestjs/throttler';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import { AgencyModule } from './modules/agency/agency.module';
import { GamificationModule } from './modules/gamification/gamification.module';
import { AdminModule } from './modules/admin/admin.module';
import { RelationshipModule } from './modules/relationship/relationship.module';
import { RankingsModule } from './modules/rankings/rankings.module';
import { FxAssetsModule } from './modules/fx-assets/fx-assets.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: seconds(60),
        limit: 120, // baseline global rate limit
      },
    ]),
    PrismaModule,
    RedisModule,
    FcmModule,
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
    RelationshipModule,
    RankingsModule,
    FxAssetsModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: EmailVerifiedGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
  ],
})
export class AppModule {}

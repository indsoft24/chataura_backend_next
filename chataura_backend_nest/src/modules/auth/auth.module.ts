import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { OtpService } from './otp.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>(
          'JWT_SECRET',
          'change-me-to-a-long-random-secret',
        ),
        signOptions: {
          expiresIn: Number(config.get('JWT_ACCESS_TTL_SECONDS', '3600')),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, OtpService],
  exports: [AuthService, TokenService, OtpService],
})
export class AuthModule {}

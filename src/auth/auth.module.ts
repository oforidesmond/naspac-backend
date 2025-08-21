import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { HttpModule } from '@nestjs/axios';
import { CaptchaGuard } from './captcha.guard';
import { PrismaService } from 'prisma/prisma.service';
import { SmsService } from './sms.service';

@Module({
  imports: [
    UsersModule,
     NotificationsModule,
     HttpModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1d' },
      }),
      inject: [ConfigService],
    }),
    ConfigModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, CaptchaGuard, PrismaService, SmsService],
  exports: [AuthService],
})
export class AuthModule {}
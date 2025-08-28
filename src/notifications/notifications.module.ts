import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { EmailProcessor } from './email.processor';

@Module({
  imports: [
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT, 10),
      },
    }),
    BullModule.registerQueueAsync({
      name: 'email',
      useFactory: async (configService: ConfigService) => ({
        redis: configService.get<string>('REDIS_URL'),
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [NotificationsService, EmailProcessor],
  exports: [NotificationsService],
})
export class NotificationsModule {}
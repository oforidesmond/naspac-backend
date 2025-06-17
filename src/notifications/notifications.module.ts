import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { EmailProcessor } from './email.processor';

@Module({
  imports: [
    ConfigModule.forRoot(), // Ensure ConfigService is available
    BullModule.registerQueueAsync({
      name: 'email',
      useFactory: async (configService: ConfigService) => ({
        redis: configService.get<string>('REDIS_URL'), // Pass REDIS_URL directly
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [NotificationsService, EmailProcessor],
  exports: [NotificationsService],
})
export class NotificationsModule {}
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { DocumentsService } from './documents.service';
import { LocalStorageService } from './local-storage.service';
import { DocumentsController } from './documents.controller';
import { PrismaService } from 'prisma/prisma.service';
import { DatabaseModule } from 'src/database.module';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
   imports: [DatabaseModule,      NotificationsModule, HttpModule,
   ],
  controllers: [DocumentsController],
  providers: [DocumentsService, LocalStorageService],
  exports: [DocumentsService, LocalStorageService],
})
export class DocumentsModule {}
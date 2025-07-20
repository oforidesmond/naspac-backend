import { Module } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { SupabaseStorageService } from './supabase-storage.service';
import { DocumentsController } from './documents.controller';
import { PrismaService } from 'prisma/prisma.service';
import { DatabaseModule } from 'src/database.module';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
   imports: [DatabaseModule,      NotificationsModule,
   ],
  controllers: [DocumentsController],
  providers: [DocumentsService, SupabaseStorageService],
  exports: [DocumentsService, SupabaseStorageService],
})
export class DocumentsModule {}
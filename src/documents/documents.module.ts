import { Module } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { SupabaseStorageService } from './supabase-storage.service';
import { DocumentsController } from './documents.controller';
import { PrismaService } from 'prisma/prisma.service';
import { DatabaseModule } from 'src/database.module';

@Module({
   imports: [DatabaseModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, SupabaseStorageService],
  exports: [DocumentsService, SupabaseStorageService],
})
export class DocumentsModule {}
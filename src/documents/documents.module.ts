import { Module } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { SupabaseStorageService } from './supabase-storage.service';

@Module({
  providers: [DocumentsService, SupabaseStorageService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseStorageService {
  private supabase;

  constructor(private configService: ConfigService) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL'),
      this.configService.get<string>('SUPABASE_KEY'),
    );
  }

  async uploadFile(file: Buffer, fileName: string, bucket: string = 'onboarding-documents') {
    const { data, error } = await this.supabase.storage
      .from(bucket)
      .upload(fileName, file, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (error) {
      throw new Error(`Failed to upload file: ${error.message}`);
    }

    // Get public URL for the uploaded file
    const { data: urlData } = this.supabase.storage
      .from(bucket)
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  }

  async getFile(fileName: string, bucket: string = 'onboarding-documents') {
    const { data, error } = await this.supabase.storage
      .from(bucket)
      .download(fileName);

    if (error) {
      throw new Error(`Failed to download file: ${error.message}`);
    }

    return data;
  }
}
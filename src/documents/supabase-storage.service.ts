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
      { auth: { autoRefreshToken: true, persistSession: true } }
    );
  }

  async uploadFile(
    file: Buffer,
    fileName: string,
    bucket: string = 'killermike',
    isPrivate: boolean = false,
  ) {
    const { data, error } = await this.supabase.storage
      .from(bucket)
      .upload(fileName, file, {
        contentType: 'application/pdf',
        cacheControl: '3600',
        upsert: true,
      });

    if (error) {
      throw new Error(`Failed to upload file: ${error.message}`);
    }

    if (isPrivate) {
      return { fileName, bucket };
    }

    const { data: urlData } = this.supabase.storage
      .from(bucket)
      .getPublicUrl(fileName);

    if (!urlData?.publicUrl) {
      throw new Error('Failed to get public URL for file');
    }

    return urlData.publicUrl;
  }

async getFile(fileName: string, bucket: string = 'killermike') {
  try {
    const { data, error } = await this.supabase.storage
      .from(bucket)
      .download(fileName);
   if (error) {
        console.error('Supabase download error:', { fileName, bucket, error: JSON.stringify(error, null, 2) });
        throw new Error(`Failed to download file: ${JSON.stringify(error)}`);
      }
      if (!data) {
        console.error('No data returned for file:', { fileName, bucket });
        throw new Error('No data returned from Supabase');
      }
      const arrayBuffer = await data.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (err) {
      console.error('Error in getFile:', { fileName, bucket, error: err.message, stack: err.stack });
      throw new Error(`Failed to download file: ${err.message}`);
    }
}

  async getPublicUrl(fileName: string, bucket: string = 'killermike') {
    const { data } = this.supabase.storage.from(bucket).getPublicUrl(fileName);
    if (!data?.publicUrl) {
      throw new Error('Failed to get public URL for file');
    }
    return data.publicUrl;
  }
}
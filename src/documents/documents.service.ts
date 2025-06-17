import { Injectable } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import SignPdf from 'node-signpdf';
import { SupabaseStorageService } from './supabase-storage.service';
import * as fs from 'fs';

@Injectable()
export class DocumentsService {
  constructor(private supabaseStorageService: SupabaseStorageService) {}

  async signDocument(fileBuffer: Buffer, fileName: string) {
    try {
      // Load PDF using pdf-lib
      const pdfDoc = await PDFDocument.load(fileBuffer);

      // Load the PKCS#12 certificate
      const certificatePath = '../../certificates/certificate.p12'; // Replace with actual path
      const certificateBuffer = fs.readFileSync(certificatePath);

      const signPdf = new SignPdf();

      // Sign the PDF using node-signpdf
      const signedPdfBuffer = signPdf.sign(fileBuffer, certificateBuffer, {
        passphrase: 'SikaDzifa13', // Replace with actual password
      });

      // Upload signed PDF to Supabase Storage
      const signedUrl = await this.supabaseStorageService.uploadFile(
        signedPdfBuffer,
        `signed-${fileName}`,
      );

      return signedUrl;
    } catch (error) {
      console.error('Error signing PDF:', error);
      throw new Error(`Failed to sign PDF: ${error.message}`);
    }
  }
}
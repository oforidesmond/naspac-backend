import { Injectable } from '@nestjs/common';
import { SupabaseStorageService } from './supabase-storage.service';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { createHash } from 'crypto';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    private supabaseStorageService: SupabaseStorageService,
  ) {}

  async signDocument(
    submissionId: number,
    fileName: string,
    adminId: number,
    signatureImagePath?: string,
    stampImagePath?: string,
  ) {
    try {
      // Verify submission exists and is pending endorsement
      const submission = await this.prisma.submission.findUnique({
        where: { id: submissionId },
        include: { user: true },
      });
      if (!submission || submission.status !== 'PENDING_ENDORSEMENT') {
        throw new Error('Submission not found or not ready for endorsement');
      }

      // Load PDF from Supabase
      console.log('Fetching file from Supabase:', { fileName });
      const fileBuffer = await this.supabaseStorageService.getFile(fileName);
      console.log('PDF buffer size:', fileBuffer.length);
      if (!fileBuffer || fileBuffer.length === 0) {
        console.error('File buffer is null or empty for:', { fileName });
        throw new Error('Failed to retrieve file from Supabase');
      }

      // Load PDF using pdf-lib
      const pdfDoc = await PDFDocument.load(fileBuffer);

      // Ensure the PDF has at least 3 pages
      if (pdfDoc.getPageCount() < 3) {
        throw new Error('Appointment letter must have at least 3 pages');
      }

      // Add visual signature/stamp to the third page if provided
      if (signatureImagePath && stampImagePath) {
        const page = pdfDoc.getPage(2); // Third page (index 2)
        const signatureImageBuffer = await this.supabaseStorageService.getFile(signatureImagePath, 'killermike');
        const stampImageBuffer = await this.supabaseStorageService.getFile(stampImagePath, 'killermike');

        console.log('Signature buffer size:', signatureImageBuffer.length);
        console.log('Stamp buffer size:', stampImageBuffer.length);

        const signatureImage = await pdfDoc.embedPng(signatureImageBuffer);
        const stampImage = await pdfDoc.embedPng(stampImageBuffer);

        // Draw signature and stamp on the third page
        page.drawImage(signatureImage, {
          x: 50,
          y: 50,
          width: 100,
          height: 50,
        });
        page.drawImage(stampImage, {
          x: 160,
          y: 50,
          width: 100,
          height: 50,
        });
      } else {
        // Fallback: Add text-based signature to the third page
        const page = pdfDoc.getPage(2);
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        page.drawText(`Signed by Admin ID: ${adminId}`, {
          x: 50,
          y: 50,
          size: 12,
          font,
          color: rgb(0, 0, 0),
        });
      }

      // Save modified PDF as Buffer
      const modifiedPdfBuffer = Buffer.from(await pdfDoc.save());

      // Generate SHA-256 hash of the modified PDF
      const documentHash = createHash('sha256').update(modifiedPdfBuffer).digest('hex');

      // Upload modified PDF to Supabase Storage
      const signedFileName = `signed-${fileName}`;
      const signedUrl = await this.supabaseStorageService.uploadFile(
        modifiedPdfBuffer,
        signedFileName,
      );

      // Update submission status and URLs
      const updatedSubmission = await this.prisma.submission.update({
        where: { id: submissionId },
        data: {
          status: 'ENDORSED',
          appointmentLetterUrl: submission.appointmentLetterUrl && fileName.includes('appointment')
            ? signedUrl
            : submission.appointmentLetterUrl,
          postingLetterUrl: submission.postingLetterUrl && fileName.includes('posting')
            ? signedUrl
            : submission.postingLetterUrl,
        },
      });

      // Create document record with hash
      const document = await this.prisma.document.create({
        data: {
          submissionId,
          adminId,
          originalUrl: await this.supabaseStorageService.getPublicUrl(fileName),
          signedUrl,
          signedAt: new Date(),
          documentHash,
        },
      });

      // Log the signing action
      await this.prisma.auditLog.create({
        data: {
          submissionId,
          action: 'DOCUMENT_SIGNED',
          userId: adminId,
          details: `Document ${signedFileName} signed for submission ${submissionId}`,
        },
      });

      return { signedUrl, documentId: document.id };
    } catch (error) {
      console.error('Error signing PDF:', {
        submissionId,
        fileName,
        error: error.message,
        stack: error.stack,
      });
      throw new Error(`Failed to sign PDF: ${error.message}`);
    }
  }
}
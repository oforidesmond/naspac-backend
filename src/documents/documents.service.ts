import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { SupabaseStorageService } from './supabase-storage.service';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { createHash } from 'crypto';
import { PrismaService } from 'prisma/prisma.service';
import { Readable } from 'stream';
import { createClient } from '@supabase/supabase-js';

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
        const verticalOffset = 40;
        const page = pdfDoc.getPage(2); // Third page (index 2)
        const { width, height } = page.getSize();
        const sigWidth = 100;
        const sigHeight = 50;
        const centerX = (width - sigWidth) / 2;
        const centerY = height / 2;
        const adjustedY = centerY - verticalOffset;
        const signatureImageBuffer = await this.supabaseStorageService.getFile(signatureImagePath, 'killermike');
        const stampImageBuffer = await this.supabaseStorageService.getFile(stampImagePath, 'killermike');

        console.log('Signature buffer size:', signatureImageBuffer.length);
        console.log('Stamp buffer size:', stampImageBuffer.length);

        const signatureImage = await pdfDoc.embedPng(signatureImageBuffer);
        const stampImage = await pdfDoc.embedPng(stampImageBuffer);

        // Draw signature and stamp on the third page
        page.drawImage(signatureImage, {
         x: centerX,
        y: adjustedY,
        width: sigWidth,
        height: sigHeight,
        });
        page.drawImage(stampImage, {
         x: centerX,
        y: adjustedY,
        width: sigWidth,
        height: sigHeight,
        });
      } else {
        // Fallback: Add text-based signature to the third page
        const page = pdfDoc.getPage(2);
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        page.drawText(`Signed by Admin ID: ${adminId}`, {
          x: 54,
          y: 53,
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
          action: 'STATUS_CHANGED_TO_ENDORSED',
          userId: adminId,
          details: `Document ${signedFileName} signed for submission ${submissionId}`,
        },
      });

        await this.prisma.notification.create({
        data: {
          title: 'Appointment Letter Endorsed',
          description: 'Appointment letter has been endorsed successfully.',
          timestamp: new Date(),
          iconType: 'USER',
          role: 'ADMIN',
          userId: adminId,
        },
      });

      await this.prisma.notification.create({
        data: {
          title: 'Appointment Letter Endorsed',
          description: 'Your appointment letter has been endorsed successfully.',
          timestamp: new Date(),
          iconType: 'USER',
          role: 'PERSONNEL',
          userId: submission.userId,
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

  async downloadAppointmentLetter(userId: number, type: 'appointment' | 'endorsed' | 'job_confirmation') {
  // Verify user is PERSONNEL
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, deletedAt: true, nssNumber: true },
  });
  if (!user || user.deletedAt) {
    throw new HttpException('User not found or deleted', HttpStatus.NOT_FOUND);
  }
  if (user.role !== 'PERSONNEL') {
    throw new HttpException('Only PERSONNEL can access this endpoint', HttpStatus.FORBIDDEN);
  }

  // Fetch submission with appointmentLetterUrl
  const submission = await this.prisma.submission.findUnique({
    where: { userId },
    select: { id: true, status: true, deletedAt: true, appointmentLetterUrl: true, jobConfirmationLetterUrl: true },
  });
  if (!submission || submission.deletedAt) {
    throw new HttpException('Submission not found or deleted', HttpStatus.NOT_FOUND);
  }

  // Validate status for file type
  const validStatuses = {
    appointment: ['VALIDATED', 'COMPLETED'],
    endorsed: ['ENDORSED'],
    job_confirmation: ['VALIDATED', 'COMPLETED'],
  };
  if (!validStatuses[type].includes(submission.status)) {
    throw new HttpException(
 `Cannot download ${type} letter with status: ${submission.status}`,     
  HttpStatus.BAD_REQUEST,
    );
  }

  // Determine file URL based on type
  let fileUrl: string | null = null;
  if (type === 'appointment') {
    fileUrl = submission.appointmentLetterUrl;
  } else if (type === 'endorsed') {
    const document = await this.prisma.document.findFirst({
      where: { submissionId: submission.id },
      orderBy: { signedAt: 'desc' },
      select: { signedUrl: true },
    });
    if (!document || !document.signedUrl) {
      throw new HttpException('No signed document found for this submission', HttpStatus.NOT_FOUND);
    }
    fileUrl = document.signedUrl;
  } else if (type === 'job_confirmation') {
    fileUrl = submission.jobConfirmationLetterUrl;
  }

  if (!fileUrl) {
    throw new HttpException(`No ${type} letter found for submission`, HttpStatus.NOT_FOUND);
  }

  // Extract fileName from URL (remove Supabase base URL)
  const fileName = fileUrl.replace(`${process.env.SUPABASE_URL}/storage/v1/object/public/killermike/`, '');
  if (!fileName) {
    throw new HttpException('Invalid file URL', HttpStatus.BAD_REQUEST);
  }

  // Download file from Supabase
  try {
     const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    const { data, error } = await supabase.storage.from('killermike').download(fileName);
    if (error || !data) {
      throw new HttpException(`Failed to retrieve ${type} letter`, HttpStatus.NOT_FOUND);
    }

    // Convert Buffer to stream
     const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

     // Update status to COMPLETED for job_confirmation download if VALIDATED
    await this.prisma.$transaction(async (prisma) => {
      if (type === 'job_confirmation' && submission.status === 'VALIDATED') {
        await prisma.submission.update({
          where: { id: submission.id },
          data: {
            status: 'COMPLETED',
            updatedAt: new Date(),
          },
        });

        // Log status change
        await prisma.auditLog.create({
          data: {
            submissionId: submission.id,
            action: 'STATUS_CHANGED_TO_COMPLETED',
            userId,
            details: `Submission (ID: ${submission.id}, NSS: ${user.nssNumber || 'Unknown'}) status changed to COMPLETED after downloading job confirmation letter`,
            createdAt: new Date(),
          },
        });

         // Create notification for PERSONNEL
          await prisma.notification.create({
            data: {
              title: 'Onboarding Completed',
              description: 'Your onboarding process is complete.',
              timestamp: new Date(),
              iconType: 'USER',
              role: 'PERSONNEL',
              userId,
            },
          });
      }

      // Log download action
      await prisma.auditLog.create({
        data: {
          submissionId: submission.id,
          action: `DOWNLOAD_${type.toUpperCase()}_LETTER`,
          userId,
          details: `Personnel (ID: ${userId}, NSS: ${user.nssNumber || 'Unknown'}) downloaded ${type} letter for submission ID ${submission.id}`,
          createdAt: new Date(),
        },
      });
    });

    return stream;
  } catch (error) {
    console.error('Error downloading letter:', { userId, submissionId: submission.id, fileName, type, error: error.message });
    throw new HttpException(`Failed to retrieve ${type} letter: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

  //upload template
  async uploadTemplate(userId: number, template: Express.Multer.File, name: string) {
  // Verify user is ADMIN
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
  if (!user || user.role !== 'ADMIN') {
    throw new HttpException('Only ADMIN can upload templates', HttpStatus.FORBIDDEN);
  }

  // Validate file
  if (!template || !['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(template.mimetype)) {
    throw new HttpException('Template must be a PDF or Word file', HttpStatus.BAD_REQUEST);
  }

  // Initialize Supabase client
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

  // Upload template to Supabase
  const fileExtension = template.mimetype === 'application/pdf' ? 'pdf' : 'docx';
  const fileKey = `templates/job-confirmation-${userId}-${Date.now()}.${fileExtension}`;
  const { error } = await supabase.storage
    .from('killermike')
    .upload(fileKey, template.buffer, {
      contentType: template.mimetype,
      cacheControl: '3600',
    });
  if (error) {
    console.error('Failed to upload template:', error);
    throw new HttpException(`Failed to upload template: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
  }
  const { data: urlData } = supabase.storage.from('killermike').getPublicUrl(fileKey);
  if (!urlData || !urlData.publicUrl) {
    throw new HttpException('Failed to get public URL for template', HttpStatus.INTERNAL_SERVER_ERROR);
  }

  // Store template metadata in database
  const templateRecord = await this.prisma.template.create({
    data: {
      name: name || 'Job Confirmation Letter Template',
      type: 'job_confirmation',
      fileUrl: urlData.publicUrl,
      createdBy: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  // Create audit log
  await this.prisma.auditLog.create({
    data: {
      submissionId: null,
      action: 'TEMPLATE_UPLOADED',
      userId,
      details: `Admin (ID: ${userId}) uploaded job confirmation letter template: ${templateRecord.name}`,
      createdAt: new Date(),
    },
  });

  await this.prisma.notification.create({
    data: {
      title: 'Letter Template Uploaded',
      description: 'Your letter template has been uploaded successfully.',
      timestamp: new Date(),
      iconType: 'SETTING',
      role: 'ADMIN',
      userId,
    },
  });
  

  return { message: 'Template uploaded successfully', template: templateRecord };
  }

  async getNotifications(userId: number, role: string) {
    // Verify user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, deletedAt: true },
    });
    if (!user || user.deletedAt) {
      throw new HttpException('User not found or deleted', HttpStatus.NOT_FOUND);
    }

    // Fetch notifications for the user's role or specific user
    const notifications = await this.prisma.notification.findMany({
      where: {
        OR: [
          { role }, // Role-specific notifications
          { userId }, // User-specific notifications
        ],
      },
      orderBy: { timestamp: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        timestamp: true,
        iconType: true,
        role: true,
      },
    });

    return notifications;
  }
}
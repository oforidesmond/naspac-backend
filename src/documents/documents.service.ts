import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { LocalStorageService } from './local-storage.service';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { createHash } from 'crypto';
import { PrismaService } from 'prisma/prisma.service';
import { Readable } from 'stream';
// Supabase removed in favor of local storage
import { NotificationsService } from 'src/notifications/notifications.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    private localStorageService: LocalStorageService,
    private notificationsService: NotificationsService,
    private httpService: HttpService,
  ) {}

  async signDocument(
    submissionId: number,
    fileName: string,
    adminId: number,
    signatureImagePath?: string,
    stampImagePath?: string,
    originalUrl?: string,
  ) {
    try {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      select: { id: true, status: true, userId: true, user: { select: { nssNumber: true, email: true, name: true } }, appointmentLetterUrl: true, postingLetterUrl: true, createdAt: true },
    });
      if (!submission || submission.status !== 'PENDING_ENDORSEMENT') {
        throw new Error('Submission not found or not ready for endorsement');
      }

      console.log('Fetching file for signing:', { fileName });
      let fileBuffer: Buffer;
      try {
        fileBuffer = await this.localStorageService.getFile(fileName);
      } catch (e) {
        // Fallback for legacy Supabase URLs: fetch remote once and cache locally under the expected key
        if (originalUrl && /^https?:\/\//i.test(originalUrl)) {
          const response = await firstValueFrom(this.httpService.get(originalUrl, { responseType: 'arraybuffer' }));
          const buffer = Buffer.from(response.data);
          await this.localStorageService.uploadFile(buffer, fileName);
          fileBuffer = buffer;
        } else {
          throw e;
        }
      }
      console.log('PDF buffer size:', fileBuffer.length);
      if (!fileBuffer || fileBuffer.length === 0) {
        console.error('File buffer is null or empty for:', { fileName });
        throw new Error('Failed to retrieve file from Supabase');
      }

      const pdfDoc = await PDFDocument.load(fileBuffer);

    if (pdfDoc.getPageCount() < 4) {
      throw new Error('Appointment letter must have at least 4 pages');
    }

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const page = pdfDoc.getPage(2); // Third page
  
    const thirdPage = pdfDoc.getPage(2);
    const { width, height } = thirdPage.getSize();
    const sigWidth = 100;
    const sigHeight = 100;
    const centerX = (width - sigWidth) / 2;
    const centerY = height / 2;
    const verticalOffset = 40;
    const adjustedY = centerY - verticalOffset;
      
      // Add submission date
      const submissionDate = new Date(submission.createdAt).toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: '2-digit',
      });
      thirdPage.drawText(`${submissionDate}`, {
        x: centerX,
        y: adjustedY + 135,
        size: 12,
        font,
        color: rgb(0, 0, 0),
      });

      if (signatureImagePath && stampImagePath) {
      const signatureImageBuffer = await this.localStorageService.getFile(signatureImagePath);
      const stampImageBuffer = await this.localStorageService.getFile(stampImagePath);

      console.log('Signature buffer size:', signatureImageBuffer.length);
      console.log('Stamp buffer size:', stampImageBuffer.length);

      const signatureImage = await pdfDoc.embedPng(signatureImageBuffer);
      const stampImage = await pdfDoc.embedPng(stampImageBuffer);

      thirdPage.drawImage(signatureImage, {
        x: centerX,
        y: adjustedY,
        width: sigWidth,
        height: sigHeight,
      });
      thirdPage.drawImage(stampImage, {
        x: centerX,
        y: adjustedY,
        width: sigWidth,
        height: sigHeight,
      });
    } else {
      // Fallback
      thirdPage.drawText(`${submissionDate}`, {
        x: 54,
        y: 190,
        size: 12,
        font,
        color: rgb(0, 0, 0),
      });
      thirdPage.drawText(`Signed by Admin ID: ${adminId}`, {
        x: 54,
        y: 53,
        size: 12,
        font,
        color: rgb(0, 0, 0),
      });
    }

     // Fourth page
    const fourthPage = pdfDoc.getPage(3);
    const emailText = 'cocobod@cocobod.gh';
    const phone1Text = '0302 - 661 - 752';
    const phone2Text = '0302 - 661 - 872';
    const headerText = 'GHANA COCOA BOARD';

     const baseY = adjustedY + 75.83;

     fourthPage.drawText(emailText, {
      x: centerX,
      y: baseY,
      size: 12,
      font,
      color: rgb(0, 0, 0),
    });

    fourthPage.drawText(phone1Text, {
      x: centerX,
      y: baseY - 14.17,
      size: 12,
      font,
      color: rgb(0, 0, 0),
    });

    fourthPage.drawText(phone2Text, {
      x: centerX,
      y: baseY - 28.34,
      size: 12,
      font,
      color: rgb(0, 0, 0),
    });

    fourthPage.drawText(headerText, {
      x: centerX,
      y: baseY + 58.85,
      size: 12,
      font,
      color: rgb(0, 0, 0),
    });

      const modifiedPdfBuffer = Buffer.from(await pdfDoc.save());

      const documentHash = createHash('sha256').update(modifiedPdfBuffer).digest('hex');

      const signedFileName = `signed-${fileName}`;
      const signedUrl = await this.localStorageService.uploadFile(
        modifiedPdfBuffer,
        signedFileName,
      );

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

      const document = await this.prisma.document.create({
        data: {
          submissionId,
          adminId,
          originalUrl: await this.localStorageService.getPublicUrl(fileName),
          signedUrl,
          signedAt: new Date(),
          documentHash,
        },
      });

      await this.prisma.auditLog.create({
        data: {
          submissionId,
          action: 'STATUS_CHANGED_TO_ENDORSED',
          userId: adminId,
          details: `Document ${signedFileName} signed for submission ${submissionId}`,
        },
      });

       // notification for PERSONNEL
      await this.prisma.notification.create({
        data: {
          title: 'Document Endorsed',
          description: `Your document (Submission ID: ${submissionId}, NSS: ${submission.user.nssNumber || 'Unknown'}) has been endorsed successfully.`,
          timestamp: new Date(),
          iconType: 'USER',
          role: 'PERSONNEL',
          userId: submission.userId,
        },
      });

        await this.prisma.notification.create({
        data: {
          title: 'Appointment Letter Endorsed',
          description: `Appointment letter for ${submission.user.nssNumber || 'Unknown'} has been endorsed successfully.`,
          timestamp: new Date(),
          iconType: 'USER',
          role: 'ADMIN',
        },
      });

      await this.prisma.notification.create({
        data: {
          title: 'Appointment Letter Endorsed',
          description: `Document (Submission ID: ${submissionId}, NSS: ${submission.user.nssNumber || 'Unknown'}) has been endorsed by Admin (ID: ${adminId}).`,
          timestamp: new Date(),
          iconType: 'BELL',
          role: 'STAFF',
        },
      });

       await this.notificationsService.sendDocumentEndorsedEmail(
        submission.user.email,
        submission.user.name,
        submission.user.nssNumber || 'Unknown',
        submissionId
      );
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

  const submission = await this.prisma.submission.findFirst({
    where: { userId },
    select: { id: true, status: true, deletedAt: true, appointmentLetterUrl: true, jobConfirmationLetterUrl: true },
  });
  if (!submission || submission.deletedAt) {
    throw new HttpException('Submission not found or deleted', HttpStatus.NOT_FOUND);
  }

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

  const fileName = fileUrl.startsWith('/files/') ? fileUrl.replace('/files/', '') : fileUrl;
  if (!fileName) {
    throw new HttpException('Invalid file URL', HttpStatus.BAD_REQUEST);
  }

  try {
    const buffer = await this.localStorageService.getFile(fileName);
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    await this.prisma.$transaction(async (prisma) => {
      if (type === 'job_confirmation' && submission.status === 'VALIDATED') {
        await prisma.submission.update({
          where: { id: submission.id },
          data: {
            status: 'COMPLETED',
            updatedAt: new Date(),
          },
        });

        await prisma.auditLog.create({
          data: {
            submissionId: submission.id,
            action: 'STATUS_CHANGED_TO_COMPLETED',
            userId,
            details: `Submission (ID: ${submission.id}, NSS: ${user.nssNumber || 'Unknown'}) status changed to COMPLETED after downloading job confirmation letter`,
            createdAt: new Date(),
          },
        });

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

  //upload letter template
  async uploadTemplate(userId: number, template: Express.Multer.File, name: string) {
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
  if (!user || user.role !== 'ADMIN') {
    throw new HttpException('Only ADMIN can upload templates', HttpStatus.FORBIDDEN);
  }

  if (!template || !['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(template.mimetype)) {
    throw new HttpException('Template must be a PDF or Word file', HttpStatus.BAD_REQUEST);
  }

  const fileExtension = template.mimetype === 'application/pdf' ? 'pdf' : 'docx';
  const fileKey = `templates/job-confirmation-${userId}-${Date.now()}.${fileExtension}`;
  const publicUrl = await this.localStorageService.uploadFile(template.buffer, fileKey);

  const templateRecord = await this.prisma.template.create({
    data: {
      name: name || 'Job Confirmation Letter Template',
      type: 'job_confirmation',
      fileUrl: publicUrl,
      createdBy: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

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

  async getNotifications(userId: number, role: string, skip = 0, take = 10) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, deletedAt: true },
    });
    if (!user || user.deletedAt) {
      throw new HttpException('User not found or deleted', HttpStatus.NOT_FOUND);
    }

    const notifications = await this.prisma.notification.findMany({
    where: {
      OR: [
        { role, userId: role === 'PERSONNEL' ? userId : undefined },
        { userId, role }, // User-specific notifications
      ],
    },
      orderBy: { timestamp: 'desc' },
      skip,
      take,
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

  async sendAppointmentLetter(userId: number, submissionId: number, file: Express.Multer.File, dto: { status: string }) {
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, name: true },
  });
  if (!user || !['ADMIN', 'STAFF'].includes(user.role)) {
    throw new HttpException('Unauthorized: Only ADMIN or STAFF can send appointment letters', HttpStatus.FORBIDDEN);
  }

  const submission = await this.prisma.submission.findUnique({
    where: { id: submissionId },
    select: { id: true, userId: true, fullName: true, nssNumber: true, status: true, deletedAt: true, jobConfirmationLetterUrl: true },
  });
  if (!submission || submission.deletedAt) {
    throw new HttpException('Submission not found or deleted', HttpStatus.NOT_FOUND);
  }

  if (!['ENDORSED', 'VALIDATED'].includes(submission.status)) {
    throw new HttpException(
      `Cannot send appointment letter for submission with status: ${submission.status}`,
      HttpStatus.BAD_REQUEST,
    );
  }

  if (!file || file.mimetype !== 'application/pdf') {
    throw new HttpException('A valid PDF file is required', HttpStatus.BAD_REQUEST);
  }

  const fileKey = `job-confirmation-letters/${submissionId}-${Date.now()}.pdf`;

  return this.prisma.$transaction(async (prisma) => {
    const publicUrl = await this.localStorageService.uploadFile(file.buffer, fileKey);

    // Update submission with jobConfirmationLetterUrl and status
    const updatedSubmission = await prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: 'COMPLETED',
        jobConfirmationLetterUrl: publicUrl,
        updatedAt: new Date(),
      },
      select: { id: true, userId: true, fullName: true, nssNumber: true, status: true, jobConfirmationLetterUrl: true },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        submissionId,
        action: `APPOINTMENT_LETTER_SENT`,
        userId,
        details: `Appointment letter sent for submission (ID: ${submissionId}, NSS: ${submission.nssNumber}) by ${user.name}`,
        createdAt: new Date(),
      },
    });

    // Notify personnel
    await prisma.notification.create({
      data: {
        title: 'Appointment Letter Sent',
        description: 'Your COCOBOD Appointment Letter is available for download in your dashboard.',
        timestamp: new Date(),
        iconType: 'BELL',
        role: 'PERSONNEL',
        userId: updatedSubmission.userId,
      },
    });

    // Notify admin/staff
    await prisma.notification.create({
      data: {
        title: 'Appointment Letter Sent',
        description: `Appointment letter sent for submission (ID: ${submissionId}, NSS: ${submission.nssNumber}) by ${user.name}.`,
        timestamp: new Date(),
        iconType: 'SETTING',
        role: user.role === 'ADMIN' ? 'ADMIN' : 'STAFF',
      },
    });

    return updatedSubmission;
  });
}
}
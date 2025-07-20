import { Controller, Post, Body, UseGuards, HttpException, HttpStatus, Request, Get, Query, Res, UseInterceptors, UploadedFile } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { JwtAuthGuard } from 'src/common/guards/auth-guard';
import { RolesGuard } from 'src/common/guards/roles-guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { DocumentsService } from './documents.service';
import { RateLimitGuard } from 'src/auth/rate-limit.guard';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('documents')
export class DocumentsController {
  constructor(
    private documentsService: DocumentsService,
    private prisma: PrismaService,
  ) {}

  @Post('sign')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async signDocument(
    @Body() body: { submissionId: number; documentType: 'postingLetter' | 'appointmentLetter' },
    @Request() req,
  ) {
    const { submissionId, documentType } = body;

    // Validate submission
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: { user: true },
    });
    if (!submission) {
      throw new HttpException('Submission not found', HttpStatus.NOT_FOUND);
    }
    if (submission.status !== 'PENDING_ENDORSEMENT') {
      throw new HttpException('Submission not ready for endorsement', HttpStatus.BAD_REQUEST);
    }

    // Get admin's signature/stamp paths
    const admin = await this.prisma.user.findUnique({
      where: { id: req.user.id },
    });
    if (!admin || !admin.signage || !admin.stamp) {
      throw new HttpException(
        'Admin signature or stamp not configured',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Determine which document to sign
    const fileName =
      documentType === 'postingLetter'
         ? submission.postingLetterUrl.replace(
      `${process.env.SUPABASE_URL}/storage/v1/object/public/killermike/`,
      '',
    )
  : submission.appointmentLetterUrl.replace(
      `${process.env.SUPABASE_URL}/storage/v1/object/public/killermike/`,
      '',
    );
console.log('Raw URL:', submission.appointmentLetterUrl, 'Parsed fileName:', fileName);

    if (!fileName) {
      throw new HttpException(`No ${documentType} found for submission`, HttpStatus.BAD_REQUEST);
    }

    // Sign the document
    const { signedUrl, documentId } = await this.documentsService.signDocument(
      submissionId,
      fileName,
      req.user.id,
      admin.signage,
      admin.stamp,
    );

    return {
      message: `${documentType} signed successfully`,
      signedUrl,
      documentId,
    };
  }

  // Retrieve signed document
  @Get('signed/:submissionId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PERSONNEL', 'ADMIN')
  async getSignedDocument(@Request() req, @Body() body: { submissionId: number }) {
    const { submissionId } = body;

    // Validate submission
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: { user: true },
    });
    if (!submission) {
      throw new HttpException('Submission not found', HttpStatus.NOT_FOUND);
    }

    // Ensure user is the submission owner or an admin
    if (req.user.role !== 'ADMIN' && submission.userId !== req.user.id) {
      throw new HttpException('Unauthorized access to submission', HttpStatus.FORBIDDEN);
    }

    // Find signed document
    const document = await this.prisma.document.findFirst({
      where: { submissionId },
      orderBy: { signedAt: 'desc' }, // Get the most recent signed document
    });
    if (!document || !document.signedUrl) {
      throw new HttpException('No signed document found for this submission', HttpStatus.NOT_FOUND);
    }

    return {
      message: 'Signed document retrieved successfully',
      signedUrl: document.signedUrl,
      documentId: document.id,
    };
  }

@Get('personnel/download-appointment-letter')
@UseGuards(JwtAuthGuard, RateLimitGuard)
async downloadAppointmentLetter(
  @Request() req,
  @Query('type') type: 'appointment' | 'endorsed' | 'job_confirmation',
  @Res() res: Response,
) {
  if (!['appointment', 'endorsed', 'job_confirmation'].includes(type)) {
    throw new HttpException('Invalid type parameter', HttpStatus.BAD_REQUEST);
  }

  const fileStream = await this.documentsService.downloadAppointmentLetter(req.user.id, type);
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${type}-letter.pdf"`,
  });
  fileStream.pipe(res);
  }

  //upload template
  @Post('/upload-template')
@UseGuards(JwtAuthGuard, RolesGuard, RateLimitGuard)
@Roles('ADMIN')
@UseInterceptors(FileInterceptor('template', {
  fileFilter: (req, file, cb) => {
    if (!['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.mimetype)) {
      return cb(new Error('Only PDF or Word files are allowed'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
}))
async uploadTemplate(
  @Request() req,
  @UploadedFile() template: Express.Multer.File,
  @Body('name') name: string,
) {
  return this.documentsService.uploadTemplate(req.user.id, template, name);
  }

   @Get('notifications')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'STAFF', 'PERSONNEL')
  async getNotifications(@Request() req) {
    return this.documentsService.getNotifications(req.user.id, req.user.role);
  }
}
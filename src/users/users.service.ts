import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { AssignPersonnelToDepartmentDto, CreateDepartmentDto, CreateUserDto, GetPersonnelDto } from './dto/create-user.dto';
import * as bcrypt from 'bcrypt';
import moment from 'moment';
import { PrismaService } from 'prisma/prisma.service';
import { createClient } from '@supabase/supabase-js';
import { HttpService } from '@nestjs/axios';
import { GetSubmissionStatusCountsDto, SubmitOnboardingDto, UpdateSubmissionStatusDto } from './dto/submit-onboarding.dto';
import { firstValueFrom } from 'rxjs';
import { PDFDocument } from 'pdf-lib';
import { NotificationsService } from 'src/notifications/notifications.service';

@Injectable()
export class UsersService {
  private supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );

  constructor(private prisma: PrismaService,
    private httpService: HttpService,
    private notificationsService: NotificationsService,
  ) {}

  async getUserProfile(userId: number) {
  // Fetch user profile
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      nssNumber: true,
      staffId: true,
      email: true,
      role: true,
      deletedAt: true,
    },
  });

  // Check if user exists and is not deleted
  if (!user || user.deletedAt) {
    throw new HttpException('User not found or deleted', HttpStatus.NOT_FOUND);
  }

  // Return selected fields
  return {
    name: user.name || null,
    nssNumber: user.nssNumber || null,
    staffId: user.staffId || null,
    email: user.email || null,
    role: user.role,
  };
}

async createUser(dto: CreateUserDto) {
  const hashedPassword = dto.password ? await bcrypt.hash(dto.password, 10) : null;
  return this.prisma.user.create({
    data: {
      nssNumber: dto.nssNumber ?? null,
      staffId: dto.staffId ?? null,
      email: dto.email,
      name: dto.name ?? null,
      password: hashedPassword,
      role: dto.role,
    },
  });
}

   async findByStaffId(staffId: string) {
    return this.prisma.user.findUnique({
      where: { staffId },
    });
  }

  async findByNssNumber(nssNumber: string) {
    return this.prisma.user.findUnique({
      where: { nssNumber },
    });
  }


    async findByNssNumberOrStaffId(identifier: string) {
    return this.prisma.user.findFirst({
      where: {
        OR: [
          { nssNumber: identifier },
          { staffId: identifier },
        ],
      },
    });
  }

  async findById(id: number) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async updateUser(id: number, data: Partial<{ email: string; password: string }>) {
    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    }
    return this.prisma.user.update({ where: { id }, data });
  }

  async findByEmail(email: string) {
  return this.prisma.user.findUnique({ where: { email } });
  }

 async submitOnboarding(userId: number, dto: SubmitOnboardingDto, files: { postingLetter?: Express.Multer.File; appointmentLetter?: Express.Multer.File }) {
    // Verify user is PERSONNEL and NSS number matches
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== 'PERSONNEL' || user.nssNumber !== dto.nssNumber) {
      throw new HttpException('Unauthorized or invalid NSS number', HttpStatus.FORBIDDEN);
    }

    // Check for existing submission
    const existingSubmission = await this.prisma.submission.findUnique({
      where: { userId_nssNumber: { userId, nssNumber: dto.nssNumber } },
    });
    if (existingSubmission) {
      throw new HttpException('Submission already exists for this user', HttpStatus.BAD_REQUEST);
    }

    // Validate files
    if (files.postingLetter && files.postingLetter.mimetype !== 'application/pdf') {
      throw new HttpException('Posting letter must be a PDF', HttpStatus.BAD_REQUEST);
    }
    if (files.appointmentLetter && files.appointmentLetter.mimetype !== 'application/pdf') {
      throw new HttpException('Appointment letter must be a PDF', HttpStatus.BAD_REQUEST);
    }

    // Upload files to Supabase Storage
    let postingLetterUrl = '';
    let appointmentLetterUrl = '';

    if (files.postingLetter) {
      const fileKey = `posting-letters/${userId}-${Date.now()}.pdf`;
      const { data, error } = await this.supabase.storage
        .from('killermike')
        .upload(fileKey, files.postingLetter.buffer, {
          contentType: 'application/pdf',
          cacheControl: '3600',
        });
      if (error) {
        console.error('Failed to upload posting letter:', error);
        throw new HttpException(`Failed to upload posting letter: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
      }
      const { data: urlData } = this.supabase.storage
        .from('killermike')
        .getPublicUrl(fileKey);

      if (!urlData || !urlData.publicUrl) {
        throw new HttpException('Failed to get public URL for posting letter', HttpStatus.INTERNAL_SERVER_ERROR);
      }
      postingLetterUrl = urlData.publicUrl;
    }

    if (files.appointmentLetter) {
      const fileKey = `appointment-letters/${userId}-${Date.now()}.pdf`;
      const { data, error } = await this.supabase.storage
        .from('killermike')
        .upload(fileKey, files.appointmentLetter.buffer, {
          contentType: 'application/pdf',
        });
      if (error) {
        throw new HttpException(`Failed to upload appointment letter: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
      }
      const { data: urlData } = this.supabase.storage
        .from('killermike')
        .getPublicUrl(fileKey);
      appointmentLetterUrl = urlData.publicUrl;
    }

    // Convert yearOfNss string to number
    const yearOfNss = parseInt(dto.yearOfNss, 10);
    if (isNaN(yearOfNss) || yearOfNss < 1900 || yearOfNss > new Date().getFullYear()) {
      throw new HttpException('Invalid NSS year', HttpStatus.BAD_REQUEST);
    }

     // Update User and create Submission in a transaction
  return this.prisma.$transaction(async (prisma) => {
    // Update User with fullName and email from submission
    await prisma.user.update({
      where: { id: userId },
      data: {
        name: dto.fullName,
        email: dto.email,
        updatedAt: new Date(),
      },
    });

    // Create submission
    const submission = await prisma.submission.create({
      data: {
        userId,
        fullName: dto.fullName,
        nssNumber: dto.nssNumber,
        gender: dto.gender,
        email: dto.email,
        placeOfResidence: dto.placeOfResidence,
        phoneNumber: dto.phoneNumber,
        universityAttended: dto.universityAttended,
        regionOfSchool: dto.regionOfSchool,
        yearOfNss,
        programStudied: dto.programStudied,
        divisionPostedTo: dto.divisionPostedTo,
        postingLetterUrl,
        appointmentLetterUrl,
        status: 'PENDING',
      },
    });

    // Create audit log entry
    await prisma.auditLog.create({
      data: {
        submissionId: submission.id,
        action: `STATUS_CHANGED_TO_PENDING`,
        userId,
        details: `${`Submission status changed to PENDING`}`,
        createdAt: new Date(),
      },
    });

    await prisma.notification.create({
      data: {
        title: 'Submission Created',
        description: `Your onboarding submission has been submitted and is pending review.`,
        timestamp: new Date(),
        iconType: 'USER',
        userId,
        role: 'PERSONNEL',
      },
    });

    // Create notification for ADMIN/STAFF
    await prisma.notification.create({
      data: {
        title: 'New Submission Received',
        description: `A new submission (ID: ${submission.id}, NSS: ${dto.nssNumber}) has been submitted by Personnel (ID: ${userId}).`,
        timestamp: new Date(),
        iconType: 'BELL',
        role: 'ADMIN',
      },
    });

     // Create notification for ADMIN/STAFF
    await prisma.notification.create({
      data: {
        title: 'New Submission Received',
        description: `A new submission (ID: ${submission.id}, NSS: ${dto.nssNumber}) has been submitted by Personnel (ID: ${userId}).`,
        timestamp: new Date(),
        iconType: 'BELL',
        role: 'STAFF',
      },
    });

    await this.notificationsService.sendSubmissionConfirmationEmail(
      dto.email,
      dto.fullName,
    );

    return submission;
    });
  }

  async submitVerificationForm(userId: number, verificationForm: Express.Multer.File) {
  // Verify user is PERSONNEL
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, deletedAt: true, nssNumber: true },
  });
  if (!user || user.deletedAt) {
    throw new HttpException('User not found or deleted', HttpStatus.NOT_FOUND);
  }
  if (user.role !== 'PERSONNEL') {
    throw new HttpException('Only PERSONNEL can submit verification forms', HttpStatus.FORBIDDEN);
  }

  // Fetch submission
  const submission = await this.prisma.submission.findUnique({
    where: { userId },
    select: { id: true, status: true, deletedAt: true, verificationFormUrl: true },
  });
  if (!submission || submission.deletedAt) {
    throw new HttpException('Submission not found or deleted', HttpStatus.NOT_FOUND);
  }

  // Validate submission status
  if (submission.status !== 'ENDORSED') {
    throw new HttpException(
      `Verification form can only be submitted when status is ENDORSED, current status: ${submission.status}`,
      HttpStatus.BAD_REQUEST,
    );
  }

  // Validate file
  if (!verificationForm || verificationForm.mimetype !== 'application/pdf') {
    throw new HttpException('Verification form must be a PDF', HttpStatus.BAD_REQUEST);
  }

  // Initialize Supabase client
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

  // Upload verification form to Supabase
  const fileKey = `verification-forms/${userId}-${Date.now()}.pdf`;
  const { data, error } = await supabase.storage
    .from('killermike')
    .upload(fileKey, verificationForm.buffer, {
      contentType: 'application/pdf',
      cacheControl: '3600',
    });
  if (error) {
    console.error('Failed to upload verification form:', error);
    throw new HttpException(`Failed to upload verification form: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
  }
  const { data: urlData } = supabase.storage.from('killermike').getPublicUrl(fileKey);
  if (!urlData || !urlData.publicUrl) {
    throw new HttpException('Failed to get public URL for verification form', HttpStatus.INTERNAL_SERVER_ERROR);
  }
  const verificationFormUrl = urlData.publicUrl;

  // Update submission with verificationFormUrl in a transaction
  return this.prisma.$transaction(async (prisma) => {
    const updatedSubmission = await prisma.submission.update({
      where: { id: submission.id },
      data: {
        verificationFormUrl,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        userId: true,
        fullName: true,
        nssNumber: true,
        status: true,
        verificationFormUrl: true,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        submissionId: submission.id,
        action: 'VERIFICATION_FORM_SUBMITTED',
        userId,
        details: `Personnel (ID: ${userId}, NSS: ${user.nssNumber || 'Unknown'}) submitted verification form for submission ID ${submission.id}`,
        createdAt: new Date(),
      },
    });

      await this.prisma.notification.create({
        data: {
          title: 'Submitted Verification Form',
          description: 'Your verification form has been submitted successfully.',
          timestamp: new Date(),
          iconType: 'USER',
          role: 'PERSONNEL',
          userId: userId,
        },
      });

      await prisma.notification.create({
      data: {
        title: 'New Verification Form Submitted',
        description: `A verification form for submission (ID: ${submission.id}, NSS: ${user.nssNumber || 'Unknown'}) has been submitted by Personnel (ID: ${userId}).`,
        timestamp: new Date(),
        iconType: 'BELL',
        role: 'STAFF',
      },
    });

      await prisma.notification.create({
      data: {
        title: 'New Verification Form Submitted',
        description: `A verification form for submission (ID: ${submission.id}, NSS: ${user.nssNumber || 'Unknown'}) has been submitted by Personnel (Name: ${updatedSubmission.fullName}).`,
        timestamp: new Date(),
        iconType: 'BELL',
        role: 'ADMIN',
      },
    });

     // Fetch all STAFF users to send emails
    const staffUsers = await prisma.user.findMany({
      where: { role: 'STAFF', deletedAt: null },
      select: { email: true, name: true },
    });

    // Queue email for each STAFF user
    for (const staff of staffUsers) {
      await this.notificationsService.sendVerificationFormEmail(
        staff.email,
        staff.name,
        updatedSubmission.fullName,
        updatedSubmission.nssNumber,
        submission.id
      );
    }

    return updatedSubmission;
  });
}

  async getGhanaUniversities() {
    try {
      const response = await firstValueFrom(
        this.httpService.get('http://universities.hipolabs.com/search?country=Ghana'),
      );
      return response.data.map((uni: any) => ({
        name: uni.name,
        // region: uni['state-province'] || 'Unknown',
      }));
    } catch (error) {
      console.error('Failed to fetch universities:', error.message);
      return [];
    }
  }

   async getOnboardingStatus(userId: number) {
    const submission = await this.prisma.submission.findFirst({
      where: { userId },
    });
    return { hasSubmitted: !!submission };
  }

   async getAllSubmissions() {
    const currentYear = new Date().getFullYear();
    return this.prisma.submission.findMany({
        where: {
      yearOfNss: currentYear,
    },
      select: {
        id: true,
        fullName: true,
        nssNumber: true,
        gender: true,
        email: true,
        placeOfResidence: true,
        phoneNumber: true,
        universityAttended: true,
        regionOfSchool: true,
        yearOfNss: true,
        programStudied: true,
        divisionPostedTo: true,
        postingLetterUrl: true,
        appointmentLetterUrl: true,
        verificationFormUrl: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

 async updateSubmissionStatus(
  userId: number,
  submissionId: number,
  dto: UpdateSubmissionStatusDto,
) {
  // Verify user is ADMIN or STAFF
  const user = await this.prisma.user.findUnique({ where: { id: userId } });
  if (!user || !['ADMIN', 'STAFF'].includes(user.role)) {
    throw new HttpException('Unauthorized: Only ADMIN or STAFF can update submission status', HttpStatus.FORBIDDEN);
  }

  // Verify submission exists
  const submission = await this.prisma.submission.findUnique({
    where: { id: submissionId },
    select: { id: true, userId: true, fullName: true, nssNumber: true, status: true, deletedAt: true, jobConfirmationLetterUrl: true },
  });
  if (!submission || submission.deletedAt) {
    throw new HttpException('Submission not found', HttpStatus.NOT_FOUND);
  }

  // Validate status transition (optional: add specific business rules for status changes)
  const validStatusTransitions = {
    PENDING: ['PENDING_ENDORSEMENT', 'REJECTED'],
    PENDING_ENDORSEMENT: ['ENDORSED', 'REJECTED'],
    ENDORSED: ['VALIDATED', 'REJECTED'],
    VALIDATED: ['COMPLETED', 'REJECTED'],
    REJECTED: ['PENDING'], // Allow resubmission
    COMPLETED: [], // No further transitions
  };

  if (
    validStatusTransitions[submission.status] &&
    !validStatusTransitions[submission.status].includes(dto.status)
  ) {
    throw new HttpException(
      `Invalid status transition from ${submission.status} to ${dto.status}`,
      HttpStatus.BAD_REQUEST,
    );
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

  // Start a transaction to update submission and create audit log
  return this.prisma.$transaction(async (prisma) => {
     let jobConfirmationLetterUrl = submission.jobConfirmationLetterUrl;

      if (dto.status === 'VALIDATED' && !jobConfirmationLetterUrl) {
      // Fetch latest template
      const template = await prisma.template.findFirst({
        where: { type: 'job_confirmation' },
        orderBy: { createdAt: 'desc' },
        select: { fileUrl: true },
      });
      if (!template) {
        throw new HttpException('No job confirmation letter template found', HttpStatus.INTERNAL_SERVER_ERROR);
      }

       // Download template from Supabase
      const fileKey = template.fileUrl.replace(`${process.env.SUPABASE_URL}/storage/v1/object/public/killermike/`, '');
      const { data: templateData, error: templateError } = await supabase.storage
        .from('killermike')
        .download(fileKey);
      if (templateError || !templateData) {
        throw new HttpException('Failed to retrieve template', HttpStatus.INTERNAL_SERVER_ERROR);
      }

       // Load PDF template
      const templateBuffer = await templateData.arrayBuffer();
      const pdfDoc = await PDFDocument.load(templateBuffer);
  
      // Fill form fields
      const form = pdfDoc.getForm();
      const nameField = form.getTextField('name');
      const dateField = form.getTextField('date');
      if (!nameField || !dateField) {
        throw new HttpException('Template missing required form fields (name, date)', HttpStatus.INTERNAL_SERVER_ERROR);
      }
      nameField.setText(submission.fullName);
      dateField.setText(moment().format('YYYY-MM-DD'));

      // Flatten the form to embed text and remove field indicators
      form.flatten();

  // Save modified PDF
      const pdfBytes = await pdfDoc.save();
      const fileKeyOutput = `job-confirmation-letters/${submissionId}-${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from('killermike')
        .upload(fileKeyOutput, pdfBytes, {
          contentType: 'application/pdf',
          cacheControl: '3600',
        });
      if (uploadError) {
        throw new HttpException(`Failed to upload job confirmation letter: ${uploadError.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
      }
      const { data: urlData } = supabase.storage.from('killermike').getPublicUrl(fileKeyOutput);
      if (!urlData || !urlData.publicUrl) {
        throw new HttpException('Failed to get public URL for job confirmation letter', HttpStatus.INTERNAL_SERVER_ERROR);
      }
      jobConfirmationLetterUrl = urlData.publicUrl;
    }

    // Update submission status
    const updatedSubmission = await prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: dto.status,
        jobConfirmationLetterUrl,
        updatedAt: new Date(),
      },
      select: { id: true, userId: true, fullName: true, nssNumber: true, status: true, jobConfirmationLetterUrl: true },
    });

    // Create audit log entry
    await prisma.auditLog.create({
      data: {
        submissionId,
        action: `STATUS_CHANGED_TO_${dto.status}`,
        userId,
        details: `${dto.comment || `Submission status changed to ${dto.status}`}${
          dto.status === 'VALIDATED' && jobConfirmationLetterUrl ? ' and job confirmation letter generated' : ''
        }`,
        createdAt: new Date(),
      },
    });

    // Create notification for PERSONNEL
    if (['ENDORSED','VALIDATED', 'COMPLETED'].includes(dto.status)) {
      await prisma.notification.create({
        data: {
          title: `Submission ${dto.status}`,
          description: `Your submission has been ${dto.status.toLowerCase()}.${
            dto.status === 'VALIDATED' ? ' Please download your job confirmation letter.' : ''
          }`,
          timestamp: new Date(),
          iconType: dto.status === 'VALIDATED' ? 'BELL' : 'USER',
          role: 'PERSONNEL',
          userId: updatedSubmission.userId,
        },
      });
    }

    // Notify ADMIN/STAFF of status change
    await prisma.notification.create({
      data: {
        title: `Submission Status Updated`,
        description: `Submission (ID: ${submissionId}, NSS: ${submission.nssNumber}) status changed to ${dto.status} by ${user.name}.`,
        timestamp: new Date(),
        iconType: 'SETTING',
        role: user.role === 'ADMIN' ? 'ADMIN' : 'STAFF',
      },
    });

    return updatedSubmission;
    });
  }

  async getSubmissionStatusCounts(userId: number, dto: GetSubmissionStatusCountsDto) {
  // Verify user is ADMIN or STAFF
  const user = await this.prisma.user.findUnique({ where: { id: userId } });
  if (!user || !['ADMIN', 'STAFF'].includes(user.role)) {
    throw new HttpException(
      'Unauthorized: Only ADMIN or STAFF can access submission status counts',
      HttpStatus.FORBIDDEN,
    );
  }

  // Validate statuses array is not empty
  if (!dto.statuses || dto.statuses.length === 0) {
    throw new HttpException(
      'At least one status must be provided',
      HttpStatus.BAD_REQUEST,
    );
  }
  const currentYear = new Date().getFullYear();
  
  // Fetch counts of submissions that have ever been in each status
  const counts = await Promise.all(
    dto.statuses.map(async (status) => {
      const submissionIds = await this.prisma.auditLog.findMany({
        where: {
          action: `STATUS_CHANGED_TO_${status}`,
          submission: {
            deletedAt: null,
            user: {
              role: 'PERSONNEL',
            },
            yearOfNss: currentYear,
          },
        },
        select: {
          submissionId: true,
        },
        distinct: ['submissionId'], // Ensure unique submission IDs
      });

      return {
        status,
        count: submissionIds.length,
      };
    })
  );

    // Get total count of PERSONNEL submissions
  const totalCount = await this.prisma.submission.count({
    where: {
      deletedAt: null,
      user: {
        role: 'PERSONNEL',
      },
      yearOfNss: currentYear,
    },
  });

  const result = counts.reduce(
    (acc, { status, count }) => ({ ...acc, [status]: count }),
    { total: totalCount }
  );

  return result;
 }

 async getStaff(requesterId: number) {
  // Verify requester is ADMIN or STAFF
  const requester = await this.prisma.user.findUnique({ where: { id: requesterId } });
  if (!requester || !['ADMIN', 'STAFF'].includes(requester.role)) {
    throw new HttpException(
      'Unauthorized: Only admins or staff can access staff, admin, and supervisor data',
      HttpStatus.FORBIDDEN,
    );
  }

  // Fetch users with STAFF, ADMIN, or SUPERVISOR roles
  return this.prisma.user.findMany({
    where: {
      role: {
        in: ['STAFF', 'ADMIN', 'SUPERVISOR'], // Filter by specified roles
      },
      deletedAt: null, // Exclude soft-deleted users
    },
    select: {
      id: true,
      name: true,
      staffId: true,
      email: true,
      role: true,
      departmentsSupervised: {
      select: {
        id: true,
        name: true,
        },
      },
      department: { select: { id: true, name: true } },
      unit: { select: { id: true, name: true } },
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'desc' }, // Sort by most recent
  });
 }

 async createDepartment(requesterId: number, dto: CreateDepartmentDto) {
  // Verify requester is ADMIN
  const requester = await this.prisma.user.findUnique({ where: { id: requesterId } });
  if (!requester || !['ADMIN', 'STAFF'].includes(requester.role)) {
    throw new HttpException('Unauthorized: Only admins and staff can create departments', HttpStatus.FORBIDDEN);
  }

  // Validate supervisor
  const supervisor = await this.prisma.user.findUnique({ where: { id: dto.supervisorId } });
  if (!supervisor || supervisor.role !== 'SUPERVISOR' || supervisor.deletedAt) {
    throw new HttpException('Invalid or deleted supervisor', HttpStatus.BAD_REQUEST);
  }

  // Validate department name uniqueness
  const existingDepartment = await this.prisma.department.findUnique({ where: { name: dto.name } });
  if (existingDepartment) {
    throw new HttpException('Department name already exists', HttpStatus.BAD_REQUEST);
  }

  // Validate unitIds if provided
  if (dto.unitIds && dto.unitIds.length > 0) {
    const units = await this.prisma.unit.findMany({
      where: { id: { in: dto.unitIds }, deletedAt: null },
    });
    if (units.length !== dto.unitIds.length) {
      throw new HttpException('One or more units are invalid or deleted', HttpStatus.BAD_REQUEST);
    }
  }

  // Create department and assign units in a transaction
  return this.prisma.$transaction(async (prisma) => {
    const department = await prisma.department.create({
      data: {
        name: dto.name,
        supervisorId: dto.supervisorId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        supervisorId: true,
        supervisor: { select: { id: true, name: true, email: true } },
        units: { select: { id: true, name: true } },
        createdAt: true,
        updatedAt: true,
      },
    });

    // Assign units to department if provided
    if (dto.unitIds && dto.unitIds.length > 0) {
      await prisma.unit.updateMany({
        where: { id: { in: dto.unitIds } },
        data: { departmentId: department.id, updatedAt: new Date() },
      });
      // Update department to include units in response
      department.units = await prisma.unit.findMany({
        where: { id: { in: dto.unitIds } },
        select: { id: true, name: true },
      });
    }

     await this.notificationsService.sendSupervisorAssignmentEmail(
      supervisor.email,
      supervisor.name,
      department.name
    );

    return department;
  });
 }

 async getDepartments(requesterId: number) {
  const requester = await this.prisma.user.findUnique({ where: { id: requesterId } });
  if (!requester || !['ADMIN', 'STAFF'].includes(requester.role)) {
    throw new HttpException('Unauthorized: Only admins or staff can access departments', HttpStatus.FORBIDDEN);
  }

  // Fetch departments
  return this.prisma.department.findMany({
    where: {
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      supervisorId: true,
      supervisor: { select: { id: true, name: true, email: true } },
      units: { select: { id: true, name: true }, where: { deletedAt: null } },
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'desc' },
    });
  }

  async getPersonnel(requesterId: number, dto: GetPersonnelDto) {
  const requester = await this.prisma.user.findUnique({ where: { id: requesterId } });
  if (!requester || !['ADMIN', 'STAFF'].includes(requester.role)) {
    throw new HttpException(
      'Unauthorized: Only admins or staff can access personnel data',
      HttpStatus.FORBIDDEN,
    );
  }
  const currentYear = new Date().getFullYear();

  // Fetch personnel with optional submission status filter
  return this.prisma.user.findMany({
    where: {
      role: 'PERSONNEL',
      deletedAt: null,
      submissions: {
        some: {
          yearOfNss: currentYear,
          deletedAt: null,
          ...(dto.statuses && dto.statuses.length > 0
            ? { status: { in: dto.statuses } }
            : {}),
        },
      },
    },
     select: {
      id: true,
      name: true,
      nssNumber: true,
      email: true,
      role: true,
      department: {
        select: {
          id: true,
          name: true,
          supervisor: { // department's supervisor
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
      unit: { select: { id: true, name: true } },
      submissions: {
        select: {
          id: true,
          fullName: true,
          nssNumber: true,
          email: true,
          gender: true,
          placeOfResidence: true,
          phoneNumber: true,
          universityAttended: true,
          regionOfSchool: true,
          yearOfNss: true,
          programStudied: true,
          divisionPostedTo: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
        where: {
          yearOfNss: currentYear,
          deletedAt: null,
          ...(dto.statuses && dto.statuses.length > 0
            ? { status: { in: dto.statuses } }
            : {}),
        },
      },
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'desc' },
   });
  }

 async assignPersonnelToDepartment(requesterId: number, dto: AssignPersonnelToDepartmentDto) {
  // Verify requester is ADMIN or STAFF
  const requester = await this.prisma.user.findUnique({ 
    where: { id: requesterId },
    select: { id: true, role: true },
  });
  if (!requester || !['ADMIN', 'STAFF'].includes(requester.role)) {
    throw new HttpException(
      'Unauthorized: Only ADMIN or STAFF can assign personnel to departments',
      HttpStatus.FORBIDDEN,
    );
  }

  // Verify department exists and is not deleted
  const department = await this.prisma.department.findUnique({
    where: { id: dto.departmentId },
    select: { id: true, name: true, deletedAt: true },
  });
  if (!department || department.deletedAt) {
    throw new HttpException('Department not found or deleted', HttpStatus.NOT_FOUND);
  }

  // Verify all submissionIds are valid, belong to PERSONNEL, and not deleted
  const submissions = await this.prisma.submission.findMany({
    where: {
      id: { in: dto.submissionIds },
      deletedAt: null,
      user: { role: 'PERSONNEL', deletedAt: null },
    },
    select: {
      id: true,
      userId: true,
      user: { select: { id: true, name: true, nssNumber: true, email: true } },
      fullName: true,
      nssNumber: true,
      status: true,
    },
  });

  if (submissions.length !== dto.submissionIds.length) {
    const invalidIds = dto.submissionIds.filter((id) => !submissions.some((sub) => sub.id === id));
    throw new HttpException(
      `Invalid or non-PERSONNEL submission IDs: ${invalidIds.join(', ')}`,
      HttpStatus.BAD_REQUEST,
    );
  }

  // Extract userIds from submissions
  const userIds = submissions.map((sub) => sub.userId);

  // Start a transaction to update users and create audit logs
  return this.prisma.$transaction(async (prisma) => {
    // Update departmentId for all valid users
    await prisma.user.updateMany({
      where: {
        id: { in: userIds },
        role: 'PERSONNEL',
        deletedAt: null,
      },
      data: {
        departmentId: dto.departmentId,
        updatedAt: new Date(),
      },
    });

    // Create audit log entries for each submission
    const auditLogs = submissions.map((sub) => ({
      submissionId: sub.id,
      action: 'PERSONNEL_ASSIGNED_TO_DEPARTMENT',
      userId: requesterId,
      details: `Personnel ${sub.user.name} (ID: ${sub.userId}, NSS: ${sub.nssNumber}) with submission ID ${sub.id} assigned to department: ${department.name} (ID: ${dto.departmentId}) by ${requester.role} (ID: ${requesterId})`,
      createdAt: new Date(),
    }));
    
    await prisma.auditLog.createMany({
      data: auditLogs,
    });

    // Return updated users with their new department and submission details
    const updatedUsers = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        name: true,
        nssNumber: true,
        email: true,
        role: true,
        department: { select: { id: true, name: true } },
        updatedAt: true,
        submissions: {
          select: { id: true, fullName: true, nssNumber: true, status: true },
          where: { id: { in: dto.submissionIds }, deletedAt: null },
        },
      },
    });

    return {
      message: `Successfully assigned ${submissions.length} personnel to department: ${department.name}`,
      users: updatedUsers,
    };
  });
  }

  //report counts
  
  async getReportCounts(requesterId?: number) {
  // Verify requester is ADMIN or STAFF
  if (requesterId) {
    const requester = await this.prisma.user.findUnique({
      where: { id: requesterId },
      select: { id: true, role: true },
    });
    if (!requester || !['ADMIN', 'STAFF'].includes(requester.role)) {
      throw new HttpException(
        'Unauthorized: Only ADMIN or STAFF can access report counts',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  const currentYear = new Date().getFullYear();
  const nssNumberPattern = `%${currentYear}`;

  // Run counts concurrently for performance
  const [
    totalPersonnel,
    totalNonPersonnel,
    totalDepartments,
    personnelByDepartment,
    acceptedCount,
    auditLogCounts,
    onboardedStudentCount,
    pendingCount,
  ] = await Promise.all([
    // 1. Total personnel (role: PERSONNEL, not deleted)
    this.prisma.user.count({
      where: { role: 'PERSONNEL', deletedAt: null },
    }),

    // 2. Total non-personnel (role not PERSONNEL, not deleted)
    this.prisma.user.count({
      where: { role: { not: 'PERSONNEL' }, deletedAt: null },
    }),

    // 3. Total departments (not deleted)
    this.prisma.department.count({
      where: { deletedAt: null },
    }),

    // 4. Personnel by department
    this.prisma.user.groupBy({
      by: ['departmentId'],
      where: { role: 'PERSONNEL', deletedAt: null, departmentId: { not: null } },
      _count: { id: true },
    }).then(async (groups) => {
      // Fetch department names for non-null departmentIds
      const departmentIds = groups.map((g) => g.departmentId).filter((id) => id !== null);
      const departments = await this.prisma.department.findMany({
        where: { id: { in: departmentIds }, deletedAt: null },
        select: { id: true, name: true },
      });
      return groups.map((group) => ({
        departmentId: group.departmentId,
        departmentName: departments.find((d) => d.id === group.departmentId)?.name || 'Unknown',
        personnelCount: group._count.id,
      }));
    }),

    // 5. Combined count of accepted submissions (ENDORSED, VALIDATED, COMPLETED)
    this.prisma.submission.count({
      where: {
        status: { in: ['ENDORSED', 'VALIDATED', 'COMPLETED'] },
        deletedAt: null,
        user: { role: 'PERSONNEL', deletedAt: null },
        yearOfNss: currentYear,
      },
    }),

    // 6. Submission status counts for PENDING, PENDING_ENDORSEMENT, REJECTED using AuditLog
    Promise.all(
      ['PENDING_ENDORSEMENT', 'REJECTED'].map(async (status) => {
        const submissionIds = await this.prisma.auditLog.findMany({
          where: {
            action: `STATUS_CHANGED_TO_${status}`,
            submission: {
              deletedAt: null,
              user: { role: 'PERSONNEL', deletedAt: null },
              yearOfNss: currentYear,
            },
          },
          select: { submissionId: true },
          distinct: ['submissionId'], // Ensure unique submission IDs
        });
        return { status, count: submissionIds.length };
      })
    ),

    // 7. Onboarded student count (PERSONNEL with used OnboardingToken)
    this.prisma.user.count({
      where: {
        role: 'PERSONNEL',
        deletedAt: null,
        nssNumber: { endsWith: nssNumberPattern },
        OnboardingToken: {
          some: {
            used: true,
            deletedAt: null,
          },
        },
      },
    }),

    // 8. Pending count
      this.prisma.submission.count({
      where: {
        status: { in: ['PENDING'] },
        deletedAt: null,
        user: { role: 'PERSONNEL', deletedAt: null },
        yearOfNss: currentYear,
      },
    }),
  ]);

  // Map audit log counts to statusCounts object
  const statusCounts = {
    pending: auditLogCounts.find((c) => c.status === 'PENDING')?.count || 0,
    pendingEndorsement: auditLogCounts.find((c) => c.status === 'PENDING_ENDORSEMENT')?.count || 0,
    endorsed: 0, // Will be part of acceptedCount
    validated: 0, // Will be part of acceptedCount
    completed: 0, // Will be part of acceptedCount
    rejected: auditLogCounts.find((c) => c.status === 'REJECTED')?.count || 0,
  };

  return {
    totalPersonnel,
    totalNonPersonnel,
    totalDepartments,
    personnelByDepartment,
    statusCounts,
    acceptedCount,
    onboardedStudentCount,
    pendingCount,
   };
  }

  // Get personnel status for a specific user
  async getPersonnelStatus(userId: number) {
  // Verify user is PERSONNEL
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, deletedAt: true },
  });
  if (!user || user.deletedAt) {
    throw new HttpException('User not found or deleted', HttpStatus.NOT_FOUND);
  }
  if (!user || !['ADMIN', 'STAFF', 'PERSONNEL'].includes(user.role)) {
    throw new HttpException('Only PERSONNEL can access this endpoint', HttpStatus.FORBIDDEN);
  }

  // Fetch submission for the user
  const submission = await this.prisma.submission.findUnique({
    where: { userId },
    select: { id: true, status: true, deletedAt: true },
  });

  // Calculate completion percentage based on status
  const statusCompletionMap: Record<string, number> = {
    PENDING: 20,
    PENDING_ENDORSEMENT: 40,
    ENDORSED: 60,
    VALIDATED: 80,
    COMPLETED: 100,
    REJECTED: 0,
  };
  const completionPercentage = submission && !submission.deletedAt
    ? statusCompletionMap[submission.status] || 0
    : 0;

  // Calculate service days (from October 1st to today)
  let serviceDays = 0;
  if (submission && !submission.deletedAt && submission.status === 'COMPLETED') {
    const today = new Date(); // July 16, 2025
    const currentYear = today.getFullYear();
    // Determine the start of the current service year (October 1st)
    const serviceStartYear = today.getMonth() >= 9 ? currentYear + 1 : currentYear; // 9 = October
    const serviceStart = new Date(serviceStartYear, 9, 1); // October 1st

    // Calculate days difference
    const timeDiff = today.getTime() - serviceStart.getTime();
    serviceDays = Math.floor(timeDiff / (1000 * 60 * 60 * 24)); // Convert ms to days
    serviceDays = Math.max(0, serviceDays); // Ensure non-negative
  }

  return {
    submissionStatus: submission && !submission.deletedAt ? submission.status : null,
    completionPercentage,
    serviceDays,
   };
  }
}
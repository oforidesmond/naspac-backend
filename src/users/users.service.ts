import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { AssignPersonnelToDepartmentDto, ChangePersonnelDepartmentDto, CreateDepartmentDto, CreateUserDto, GetPersonnelDto, UpdateDepartmentDto } from './dto/create-user.dto';
import * as bcrypt from 'bcrypt';
import moment from 'moment';
import { PrismaService } from 'prisma/prisma.service';
import { createClient } from '@supabase/supabase-js';
import { HttpService } from '@nestjs/axios';
import { GetSubmissionStatusCountsDto, SubmitOnboardingDto, UpdateSubmissionStatusDto } from './dto/submit-onboarding.dto';
import { firstValueFrom } from 'rxjs';
import { PDFDocument } from 'pdf-lib';
import { NotificationsService } from 'src/notifications/notifications.service';
import { UpdateStaffDto } from './dto/update-user.dto';
import { authenticator } from 'otplib';

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

  if (!user || user.deletedAt) {
    throw new HttpException('User not found or deleted', HttpStatus.NOT_FOUND);
  }

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
      phoneNumber: dto.phoneNumber ?? null,
      password: hashedPassword,
      role: dto.role,
      tfaSecret: authenticator.generateSecret(),
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

   async updateUser(id: number, data: Partial<{ email: string; password: string; tfaSecret: string; phoneNumber: string }>) {
    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    }
    return this.prisma.user.update({ where: { id }, data });
  }

  async findByEmail(email: string) {
  return this.prisma.user.findUnique({ where: { email } });
  }

 async submitOnboarding(userId: number, dto: SubmitOnboardingDto, files: { postingLetter?: Express.Multer.File; appointmentLetter?: Express.Multer.File }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== 'PERSONNEL' || user.nssNumber !== dto.nssNumber) {
      throw new HttpException('Unauthorized or invalid NSS number', HttpStatus.FORBIDDEN);
    }

    const existingSubmission = await this.prisma.submission.findUnique({
      where: { userId_nssNumber: { userId, nssNumber: dto.nssNumber } },
    });
    if (existingSubmission) {
      throw new HttpException('Submission already exists for this user', HttpStatus.BAD_REQUEST);
    }

    if (files.postingLetter && files.postingLetter.mimetype !== 'application/pdf') {
      throw new HttpException('Posting letter must be a PDF', HttpStatus.BAD_REQUEST);
    }
    if (files.appointmentLetter && files.appointmentLetter.mimetype !== 'application/pdf') {
      throw new HttpException('Appointment letter must be a PDF', HttpStatus.BAD_REQUEST);
    }
     if (!dto.phoneNumber || !/^\+\d{10,15}$/.test(dto.phoneNumber)) {
    throw new HttpException('Valid phone number with country code required (e.g., +233557484584)', HttpStatus.BAD_REQUEST);
  }

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

    const yearOfNss = parseInt(dto.yearOfNss, 10);
    if (isNaN(yearOfNss) || yearOfNss < 1900 || yearOfNss > new Date().getFullYear()) {
      throw new HttpException('Invalid NSS year', HttpStatus.BAD_REQUEST);
    }

  return this.prisma.$transaction(async (prisma) => {
    await prisma.user.update({
      where: { id: userId },
      data: {
        name: dto.fullName,
        email: dto.email,
        phoneNumber: dto.phoneNumber,
        tfaSecret: user.tfaSecret || authenticator.generateSecret(), 
        updatedAt: new Date(),
      },
    });

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

    await prisma.notification.create({
      data: {
        title: 'New Submission Received',
        description: `A new submission (ID: ${submission.id}, NSS: ${dto.nssNumber}) has been submitted by Personnel (ID: ${userId}).`,
        timestamp: new Date(),
        iconType: 'BELL',
        role: 'ADMIN',
      },
    });

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

  const submission = await this.prisma.submission.findUnique({
    where: { userId },
    select: { id: true, status: true, deletedAt: true, verificationFormUrl: true },
  });
  if (!submission || submission.deletedAt) {
    throw new HttpException('Submission not found or deleted', HttpStatus.NOT_FOUND);
  }

  if (submission.status !== 'ENDORSED') {
    throw new HttpException(
      `Verification form can only be submitted when status is ENDORSED, current status: ${submission.status}`,
      HttpStatus.BAD_REQUEST,
    );
  }

  if (!verificationForm || verificationForm.mimetype !== 'application/pdf') {
    throw new HttpException('Verification form must be a PDF', HttpStatus.BAD_REQUEST);
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

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

    const staffUsers = await prisma.user.findMany({
      where: { role: 'STAFF', deletedAt: null },
      select: { email: true, name: true },
    });

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
        jobConfirmationLetterUrl: true,
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
  const user = await this.prisma.user.findUnique({ where: { id: userId } });
  if (!user || !['ADMIN', 'STAFF'].includes(user.role)) {
    throw new HttpException('Unauthorized: Only ADMIN or STAFF can update submission status', HttpStatus.FORBIDDEN);
  }

  const submission = await this.prisma.submission.findUnique({
    where: { id: submissionId },
    select: { id: true, userId: true, fullName: true, nssNumber: true, email: true, status: true, deletedAt: true, jobConfirmationLetterUrl: true },
  });
  if (!submission || submission.deletedAt) {
    throw new HttpException('Submission not found', HttpStatus.NOT_FOUND);
  }

  const validStatusTransitions = {
    PENDING: ['PENDING_ENDORSEMENT', 'REJECTED'],
    PENDING_ENDORSEMENT: ['ENDORSED', 'REJECTED'],
    ENDORSED: ['VALIDATED', 'REJECTED'],
    VALIDATED: ['COMPLETED', 'REJECTED'],
    REJECTED: ['PENDING'], // Allow resubmission
    COMPLETED: [],
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

  return this.prisma.$transaction(async (prisma) => {
    let jobConfirmationLetterUrl = submission.jobConfirmationLetterUrl;

    // Commented out the letter generation logic to disable it
    /*
    if (dto.status === 'VALIDATED' && !jobConfirmationLetterUrl) {
      const template = await prisma.template.findFirst({
        where: { type: 'job_confirmation' },
        orderBy: { createdAt: 'desc' },
        select: { fileUrl: true },
      });
      if (!template) {
        throw new HttpException('No job confirmation letter template found', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      const fileKey = template.fileUrl.replace(`${process.env.SUPABASE_URL}/storage/v1/object/public/killermike/`, '');
      const { data: templateData, error: templateError } = await supabase.storage
        .from('killermike')
        .download(fileKey);
      if (templateError || !templateData) {
        throw new HttpException('Failed to retrieve template', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      const templateBuffer = await templateData.arrayBuffer();
      const pdfDoc = await PDFDocument.load(templateBuffer);
  
      const form = pdfDoc.getForm();
      const nameField = form.getTextField('name');
      const dateField = form.getTextField('date');
      if (!nameField || !dateField) {
        throw new HttpException('Template missing required form fields (name, date)', HttpStatus.INTERNAL_SERVER_ERROR);
      }
      nameField.setText(submission.fullName);
      dateField.setText(moment().format('YYYY-MM-DD'));

      form.flatten();

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
    */

    const updatedSubmission = await prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: dto.status,
        jobConfirmationLetterUrl,
        updatedAt: new Date(),
      },
      select: { id: true, userId: true, fullName: true, nssNumber: true, email: true, status: true, jobConfirmationLetterUrl: true },
    });

    await prisma.auditLog.create({
      data: {
        submissionId,
        action: `STATUS_CHANGED_TO_${dto.status}`,
        userId,
        details: `${dto.comment || `Submission status changed to ${dto.status}`}`,
        createdAt: new Date(),
      },
    });

    if (['ENDORSED', 'VALIDATED', 'COMPLETED'].includes(dto.status)) {
      await prisma.notification.create({
        data: {
          title: `Submission ${dto.status}`,
          description: `Your submission has been ${dto.status.toLowerCase()}.`,
          timestamp: new Date(),
          iconType: 'USER',
          role: 'PERSONNEL',
          userId: updatedSubmission.userId,
        },
      });
    }

     if (dto.status === 'REJECTED') {
      await this.notificationsService.sendRejectionEmail(
        updatedSubmission.email,
        updatedSubmission.fullName,
        submissionId,
        dto.comment || 'No specific reason provided'
      );
    }

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
  const user = await this.prisma.user.findUnique({ where: { id: userId } });
  if (!user || !['ADMIN', 'STAFF'].includes(user.role)) {
    throw new HttpException(
      'Unauthorized: Only ADMIN or STAFF can access submission status counts',
      HttpStatus.FORBIDDEN,
    );
  }

  if (!dto.statuses || dto.statuses.length === 0) {
    throw new HttpException(
      'At least one status must be provided',
      HttpStatus.BAD_REQUEST,
    );
  }
  const currentYear = new Date().getFullYear();
  
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
        distinct: ['submissionId'],
      });

      return {
        status,
        count: submissionIds.length,
      };
    })
  );

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
  const requester = await this.prisma.user.findUnique({ where: { id: requesterId } });
  if (!requester || !['ADMIN', 'STAFF'].includes(requester.role)) {
    throw new HttpException(
      'Unauthorized: Only admins or staff can access staff, admin, and supervisor data',
      HttpStatus.FORBIDDEN,
    );
  }

  return this.prisma.user.findMany({
    where: {
      role: {
        in: ['STAFF', 'ADMIN', 'SUPERVISOR'],
      },
      deletedAt: null,
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
    orderBy: { createdAt: 'desc' },
  });
 }

 async createDepartment(requesterId: number, dto: CreateDepartmentDto) {
  const requester = await this.prisma.user.findUnique({ where: { id: requesterId } });
  if (!requester || !['ADMIN', 'STAFF'].includes(requester.role)) {
    throw new HttpException('Unauthorized: Only admins and staff can create departments', HttpStatus.FORBIDDEN);
  }

  const supervisor = await this.prisma.user.findUnique({ where: { id: dto.supervisorId } });
  if (!supervisor || supervisor.role !== 'SUPERVISOR' || supervisor.deletedAt) {
    throw new HttpException('Invalid or deleted supervisor', HttpStatus.BAD_REQUEST);
  }

  const existingDepartment = await this.prisma.department.findUnique({ where: { name: dto.name } });
  if (existingDepartment) {
    throw new HttpException('Department name already exists', HttpStatus.BAD_REQUEST);
  }

  if (dto.unitIds && dto.unitIds.length > 0) {
    const units = await this.prisma.unit.findMany({
      where: { id: { in: dto.unitIds }, deletedAt: null },
    });
    if (units.length !== dto.unitIds.length) {
      throw new HttpException('One or more units are invalid or deleted', HttpStatus.BAD_REQUEST);
    }
  }

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

    if (dto.unitIds && dto.unitIds.length > 0) {
      await prisma.unit.updateMany({
        where: { id: { in: dto.unitIds } },
        data: { departmentId: department.id, updatedAt: new Date() },
      });
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
          supervisor: {
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

  const department = await this.prisma.department.findUnique({
    where: { id: dto.departmentId },
    select: { id: true, name: true, deletedAt: true },
  });
  if (!department || department.deletedAt) {
    throw new HttpException('Department not found or deleted', HttpStatus.NOT_FOUND);
  }

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

  const userIds = submissions.map((sub) => sub.userId);

  return this.prisma.$transaction(async (prisma) => {
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
  
  async getReportCounts(requesterId?: number) {
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
    // 1. Total personnel (not deleted)
    this.prisma.user.count({
      where: { role: 'PERSONNEL', deletedAt: null },
    }),

    // 2. Total non-personnel
    this.prisma.user.count({
      where: { role: { not: 'PERSONNEL' }, deletedAt: null },
    }),

    // 3. Total departments
    this.prisma.department.count({
      where: { deletedAt: null },
    }),

    // 4. Personnel by department
    this.prisma.user.groupBy({
      by: ['departmentId'],
      where: { role: 'PERSONNEL', deletedAt: null, departmentId: { not: null } },
      _count: { id: true },
    }).then(async (groups) => {
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

    // 5. Combined count (ENDORSED, VALIDATED, COMPLETED)
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
          distinct: ['submissionId'],
        });
        return { status, count: submissionIds.length };
      })
    ),

    // 7. Onboarded student count
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

  const statusCounts = {
    pending: auditLogCounts.find((c) => c.status === 'PENDING')?.count || 0,
    pendingEndorsement: auditLogCounts.find((c) => c.status === 'PENDING_ENDORSEMENT')?.count || 0,
    endorsed: 0,
    validated: 0,
    completed: 0,
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

  async getPersonnelStatus(userId: number) {
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

  const submission = await this.prisma.submission.findUnique({
    where: { userId },
    select: { id: true, status: true, deletedAt: true },
  });

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
    const today = new Date();
    const currentYear = today.getFullYear();
    // Determine the start of the current service year (October 1st)
    const serviceStartYear = today.getMonth() >= 9 ? currentYear + 1 : currentYear; // 9 = October
    const serviceStart = new Date(serviceStartYear, 9, 1); // October 1st

    // Calculate days difference
    const timeDiff = today.getTime() - serviceStart.getTime();
    serviceDays = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    serviceDays = Math.max(0, serviceDays); // Ensure non-negative
  }

  return {
    submissionStatus: submission && !submission.deletedAt ? submission.status : null,
    completionPercentage,
    serviceDays,
   };
  }

  async updateStaff(staffId: number, dto: UpdateStaffDto, requesterId: number) {
  const requester = await this.prisma.user.findUnique({
    where: { id: requesterId },
    select: { role: true },
  });
  if (!requester || requester.role !== 'ADMIN') {
    throw new HttpException('Only ADMIN can update staff information', HttpStatus.FORBIDDEN);
  }

  const staff = await this.prisma.user.findUnique({
    where: { id: staffId },
    select: { id: true, role: true, deletedAt: true },
  });
  if (!staff || staff.deletedAt) {
    throw new HttpException('Staff user not found or deleted', HttpStatus.NOT_FOUND);
  }
  if (!['ADMIN', 'STAFF'].includes(staff.role)) {
    throw new HttpException('Can only update ADMIN or STAFF users', HttpStatus.BAD_REQUEST);
  }

  return this.prisma.$transaction(async (prisma) => {
    const updatedStaff = await prisma.user.update({
      where: { id: staffId },
      data: {
        name: dto.name,
        staffId: dto.staffId,
        email: dto.email,
        role: dto.role,
        updatedAt: new Date(),
      },
      select: { id: true, name: true, staffId: true, email: true, role: true },
    });

    await prisma.auditLog.create({
      data: {
        submissionId: null,
        action: 'STAFF_UPDATED',
        userId: requesterId,
        details: `Admin (ID: ${requesterId}) updated staff (ID: ${staffId}, Email: ${updatedStaff.email})`,
        createdAt: new Date(),
      },
    });

    await prisma.notification.create({
      data: {
        title: 'Profile Updated',
        description: `Your profile has been updated by admin. New details: Name - ${dto.name || updatedStaff.name}, Email - ${dto.email || updatedStaff.email}, Role - ${dto.role || updatedStaff.role}.`,
        timestamp: new Date(),
        iconType: 'USER',
        role: updatedStaff.role,
        userId: staffId,
      },
    });

    await prisma.notification.create({
      data: {
        title: 'Staff Profile Updated',
        description: `Staff (ID: ${staffId}, Email: ${updatedStaff.email}) profile updated by Admin (ID: ${requesterId}).`,
        timestamp: new Date(),
        iconType: 'SETTING',
        role: 'ADMIN',
      },
    });

    return updatedStaff;
  });
}

async updateDepartment(departmentId: number, dto: UpdateDepartmentDto, requesterId: number) {
  const requester = await this.prisma.user.findUnique({
    where: { id: requesterId },
    select: { role: true },
  });
  if (!requester || requester.role !== 'ADMIN') {
    throw new HttpException('Only ADMIN can update department information', HttpStatus.FORBIDDEN);
  }

  const department = await this.prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true, name: true, supervisorId: true, deletedAt: true },
  });
  if (!department || department.deletedAt) {
    throw new HttpException('Department not found or deleted', HttpStatus.NOT_FOUND);
  }

  if (dto.supervisorId) {
    const supervisor = await this.prisma.user.findUnique({
      where: { id: dto.supervisorId },
      select: { id: true, role: true, deletedAt: true },
    });
    if (!supervisor || supervisor.deletedAt || !['ADMIN', 'STAFF'].includes(supervisor.role)) {
      throw new HttpException('Invalid or deleted supervisor', HttpStatus.BAD_REQUEST);
    }
  }

  return this.prisma.$transaction(async (prisma) => {
    const updatedDepartment = await prisma.department.update({
      where: { id: departmentId },
      data: {
        name: dto.name,
        supervisorId: dto.supervisorId,
        updatedAt: new Date(),
      },
      select: { id: true, name: true, supervisorId: true },
    });

    await prisma.auditLog.create({
      data: {
        submissionId: null,
        action: 'DEPARTMENT_UPDATED',
        userId: requesterId,
        details: `Admin (ID: ${requesterId}) updated department (ID: ${departmentId}, Name: ${updatedDepartment.name})`,
        createdAt: new Date(),
      },
    });

    if (dto.supervisorId && dto.supervisorId !== department.supervisorId) {
      await prisma.notification.create({
        data: {
          title: 'Assigned as Department Supervisor',
          description: `You have been assigned as the supervisor for department ${updatedDepartment.name}.`,
          timestamp: new Date(),
          iconType: 'USER',
          role: 'STAFF',
          userId: dto.supervisorId,
        },
      });
    }

    await prisma.notification.create({
      data: {
        title: 'Department Updated',
        description: `Department (ID: ${departmentId}, Name: ${updatedDepartment.name}) updated by Admin (ID: ${requesterId}).`,
        timestamp: new Date(),
        iconType: 'SETTING',
        role: 'ADMIN',
      },
    });

    return updatedDepartment;
    });
  }

  async deleteStaff(staffId: number, requesterId: number) {
  const requester = await this.prisma.user.findUnique({
    where: { id: requesterId },
    select: { role: true },
  });
  if (!requester || requester.role !== 'ADMIN') {
    throw new HttpException('Only ADMIN can delete staff', HttpStatus.FORBIDDEN);
  }

  const staff = await this.prisma.user.findUnique({
    where: { id: staffId },
    select: { id: true, role: true, email: true, name: true, staffId: true, deletedAt: true },
  });
  if (!staff || staff.deletedAt) {
    throw new HttpException('Staff user not found or already deleted', HttpStatus.NOT_FOUND);
  }
  if (!['ADMIN', 'STAFF'].includes(staff.role)) {
    throw new HttpException('Can only delete ADMIN or STAFF users', HttpStatus.BAD_REQUEST);
  }
  if (staffId === requesterId) {
    throw new HttpException('Cannot delete your own account', HttpStatus.BAD_REQUEST);
  }

  const supervisedDepartments = await this.prisma.department.count({
    where: { supervisorId: staffId, deletedAt: null },
  });
  if (supervisedDepartments > 0) {
    throw new HttpException('Cannot delete staff who supervises active departments', HttpStatus.BAD_REQUEST);
  }

  return this.prisma.$transaction(async (prisma) => {
    const deletedStaff = await prisma.user.update({
      where: { id: staffId },
      data: { deletedAt: new Date() },
      select: { id: true, name: true, staffId: true, email: true, role: true },
    });

    await prisma.auditLog.create({
      data: {
        submissionId: null,
        action: 'STAFF_DELETED',
        userId: requesterId,
        details: `Admin (ID: ${requesterId}) deleted staff (ID: ${staffId}, Email: ${deletedStaff.email})`,
        createdAt: new Date(),
      },
    });

    await prisma.notification.create({
      data: {
        title: 'Account Deactivated',
        description: `Your account has been deactivated by admin.`,
        timestamp: new Date(),
        iconType: 'USER',
        role: deletedStaff.role,
        userId: staffId,
      },
    });

    await prisma.notification.create({
      data: {
        title: 'Staff Account Deactivated',
        description: `Staff (ID: ${staffId}, Email: ${deletedStaff.email}) account deactivated by Admin (ID: ${requesterId}).`,
        timestamp: new Date(),
        iconType: 'SETTING',
        role: 'ADMIN',
      },
    });

    return { message: `Staff (ID: ${staffId}) successfully deactivated` };
    });
  }

  async deleteDepartment(departmentId: number, requesterId: number) {
  const requester = await this.prisma.user.findUnique({
    where: { id: requesterId },
    select: { role: true },
  });
  if (!requester || requester.role !== 'ADMIN') {
    throw new HttpException('Only ADMIN can delete departments', HttpStatus.FORBIDDEN);
  }

  const department = await this.prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true, name: true, supervisorId: true, deletedAt: true },
  });
  if (!department || department.deletedAt) {
    throw new HttpException('Department not found or already deleted', HttpStatus.NOT_FOUND);
  }

  const activeUsers = await this.prisma.user.count({
    where: { departmentId, deletedAt: null },
  });
  const activeUnits = await this.prisma.unit.count({
    where: { departmentId, deletedAt: null },
  });
  if (activeUsers > 0 || activeUnits > 0) {
    throw new HttpException('Cannot delete department with active users or units', HttpStatus.BAD_REQUEST);
  }

  return this.prisma.$transaction(async (prisma) => {
    const deletedDepartment = await prisma.department.update({
      where: { id: departmentId },
      data: { deletedAt: new Date() },
      select: { id: true, name: true, supervisorId: true },
    });

    await prisma.auditLog.create({
      data: {
        submissionId: null,
        action: 'DEPARTMENT_DELETED',
        userId: requesterId,
        details: `Admin (ID: ${requesterId}) soft-deleted department (ID: ${departmentId}, Name: ${deletedDepartment.name})`,
        createdAt: new Date(),
      },
    });

    if (deletedDepartment.supervisorId) {
      await prisma.notification.create({
        data: {
          title: 'Department Deactivated',
          description: `The department ${deletedDepartment.name} (ID: ${departmentId}) you supervised has been deactivated.`,
          timestamp: new Date(),
          iconType: 'USER',
          role: 'STAFF',
          userId: deletedDepartment.supervisorId,
        },
      });
    }

    await prisma.notification.create({
      data: {
        title: 'Department Deactivated',
        description: `Department (ID: ${departmentId}, Name: ${deletedDepartment.name}) deactivated by Admin (ID: ${requesterId}).`,
        timestamp: new Date(),
        iconType: 'SETTING',
        role: 'ADMIN',
      },
    });

    return { message: `Department (ID: ${departmentId}) successfully deactivated` };
    });
  }

  async changePersonnelDepartment(dto: ChangePersonnelDepartmentDto, requesterId: number) {
  const requester = await this.prisma.user.findUnique({
    where: { id: requesterId },
    select: { role: true },
  });
 if (!requester || !['ADMIN', 'STAFF'].includes(requester.role)) {
    throw new HttpException('Only ADMIN or STAFF can change personnel departments', HttpStatus.FORBIDDEN);
  }

  const department = await this.prisma.department.findUnique({
    where: { id: dto.departmentId },
    select: { id: true, name: true, deletedAt: true },
  });
  if (!department || department.deletedAt) {
    throw new HttpException('Department not found or deleted', HttpStatus.NOT_FOUND);
  }

  const users = await this.prisma.user.findMany({
    where: {
      id: { in: dto.userIds },
      role: 'PERSONNEL',
      deletedAt: null,
    },
    select: { id: true, name: true, nssNumber: true },
  });
  if (users.length !== dto.userIds.length) {
    throw new HttpException('One or more users not found or not PERSONNEL', HttpStatus.NOT_FOUND);
  }

  return this.prisma.$transaction(async (prisma) => {
    await prisma.user.updateMany({
      where: { id: { in: dto.userIds } },
      data: { departmentId: dto.departmentId, updatedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        submissionId: null,
        action: 'PERSONNEL_DEPARTMENT_CHANGED',
        userId: requesterId,
        details: `Admin (ID: ${requesterId}) reassigned ${users.length} personnel to department (ID: ${dto.departmentId}, Name: ${department.name})`,
        createdAt: new Date(),
      },
    });

    for (const user of users) {
      await prisma.notification.create({
        data: {
          title: 'Department Assignment',
          description: `You have been assigned to department ${department.name}.`,
          timestamp: new Date(),
          iconType: 'USER',
          role: 'PERSONNEL',
          userId: user.id,
        },
      });
    }

    await prisma.notification.create({
      data: {
        title: 'Personnel Department Reassigned',
        description: `${users.length} personnel reassigned to department ${department.name} (ID: ${dto.departmentId}) by Admin (ID: ${requesterId}).`,
        timestamp: new Date(),
        iconType: 'SETTING',
        role: 'ADMIN',
      },
    });

    return { message: `Successfully reassigned ${users.length} personnel to department ${department.name}`, departmentId: dto.departmentId };
    });
  }

  async findByPhoneNumber(phoneNumber: string) {
    return this.prisma.user.findFirst({ where: { phoneNumber } });
  }
}
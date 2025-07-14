import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from 'prisma/prisma.service';
import { createClient } from '@supabase/supabase-js';
import { HttpService } from '@nestjs/axios';
import { GetSubmissionStatusCountsDto, SubmitOnboardingDto, UpdateSubmissionStatusDto } from './dto/submit-onboarding.dto';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class UsersService {
  private supabase = createClient(
    process.env.SUPABASE_URL || 'https://nrhrgsonhgbbcbjfqafs.supabase.co',
    process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yaHJnc29uaGdiYmNiamZxYWZzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjE1OTk2OCwiZXhwIjoyMDY3NzM1OTY4fQ.hRrJaNnFA0AKmTZocoXkccYk26-g8vy1YZkNJdZ4jaQ',
  );

  constructor(private prisma: PrismaService,
    private httpService: HttpService,
  ) {}

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

    // Create submission
    return this.prisma.submission.create({
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
  });
  if (!submission) {
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

  // Start a transaction to update submission and create audit log
  return this.prisma.$transaction(async (prisma) => {
    // Update submission status
    const updatedSubmission = await prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: dto.status,
        updatedAt: new Date(),
      },
    });

    // Create audit log entry
    await prisma.auditLog.create({
      data: {
        submissionId,
        action: `STATUS_CHANGED_TO_${dto.status}`,
        userId,
        details: dto.comment || `Submission status changed to ${dto.status}`,
        createdAt: new Date(),
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
  // Fetch counts for each status
  const counts = await this.prisma.submission.groupBy({
    by: ['status'],
    where: {
      status: {
        in: dto.statuses,
      },
      deletedAt: null, 
      user: {
        role: 'PERSONNEL',
      },
      yearOfNss: currentYear,
    },
    _count: {
      _all: true,
    },
  });

    // Get total count of PERSONNEL submissions
  const totalCount = await this.prisma.submission.count({
    where: {
      deletedAt: null,
      user: {
        role: 'PERSONNEL',
      },
    },
  });

   const result = dto.statuses.reduce((acc, status) => {
    const statusCount = counts.find((c) => c.status === status)?._count._all || 0;
    return { ...acc, [status]: statusCount };
  }, { total: totalCount });

  return result;
 }
}
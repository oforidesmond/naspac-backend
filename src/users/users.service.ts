import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from 'prisma/prisma.service';
import { createClient } from '@supabase/supabase-js';
import { HttpService } from '@nestjs/axios';
import { SubmitOnboardingDto } from './dto/submit-onboarding.dto';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class UsersService {
  private supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY,
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

    // Upload files to Supabase Storage
    let postingLetterUrl = '';
    let appointmentLetterUrl = '';

    if (files.postingLetter) {
      const { data, error } = await this.supabase.storage
        .from('onboarding-documents')
        .upload(`posting-letters/${userId}-${Date.now()}.pdf`, files.postingLetter.buffer, {
          contentType: 'application/pdf',
        });
      if (error) {
        throw new HttpException('Failed to upload posting letter', HttpStatus.INTERNAL_SERVER_ERROR);
      }
      postingLetterUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/onboarding-documents/${data.path}`;
    }

    if (files.appointmentLetter) {
      const { data, error } = await this.supabase.storage
        .from('onboarding-documents')
        .upload(`appointment-letters/${userId}-${Date.now()}.pdf`, files.appointmentLetter.buffer, {
          contentType: 'application/pdf',
        });
      if (error) {
        throw new HttpException('Failed to upload appointment letter', HttpStatus.INTERNAL_SERVER_ERROR);
      }
      appointmentLetterUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/onboarding-documents/${data.path}`;
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
}
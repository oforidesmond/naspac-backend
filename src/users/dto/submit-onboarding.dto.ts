import { SubmissionStatus } from '@prisma/client';
import { IsString, IsEnum, IsEmail, IsInt, MinLength, IsOptional, Matches, IsArray } from 'class-validator';

enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
}

export class SubmitOnboardingDto {
  @IsString()
  fullName: string;

  @IsString()
  nssNumber: string;

  @IsEnum(Gender)
  gender: Gender;

  @IsEmail()
  email: string;

  @IsString()
  placeOfResidence: string;

  @IsString()
  phoneNumber: string;

  @IsString()
  universityAttended: string;

  @IsString()
  regionOfSchool: string;

  @IsString()
  @Matches(/^\d{4}$/, { message: 'Year of NSS must be a valid 4-digit year' })
  yearOfNss: string;

  @IsString()
  programStudied: string;

  @IsString()
  divisionPostedTo: string;

  @IsOptional()
  postingLetter: any;

  @IsOptional()
  appointmentLetter: any;

  @IsOptional()
  verificationForm: any;
}

export class UpdateSubmissionStatusDto {
  @IsEnum(SubmissionStatus)
  status: SubmissionStatus;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class GetSubmissionStatusCountsDto {
  @IsArray()
  @IsEnum(SubmissionStatus, { each: true })
  statuses: SubmissionStatus[];
}
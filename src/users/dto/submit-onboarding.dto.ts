import { IsString, IsEnum, IsEmail, IsInt, MinLength, IsOptional, Matches } from 'class-validator';

enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
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
  postingLetter: any; // File upload (handled by NestJS FileInterceptor)

  @IsOptional()
  appointmentLetter: any; // File upload (handled by NestJS FileInterceptor)
}
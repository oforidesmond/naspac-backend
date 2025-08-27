import { IsString, IsEmail, Matches } from 'class-validator';

export class InitOnboardingDto {
  @IsString()
  nssNumber: string;

  @IsEmail()
  email: string;

  // E.164 format with leading + and 10-15 digits
  @Matches(/^\+\d{10,15}$/,{ message: 'Valid phone number with country code required (e.g., +233557484584)' })
  phoneNumber: string;
}
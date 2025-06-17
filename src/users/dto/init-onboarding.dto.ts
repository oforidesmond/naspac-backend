import { IsString, IsEmail } from 'class-validator';

export class InitOnboardingDto {
  @IsString()
  nssNumber: string;

  @IsEmail()
  email: string;
}
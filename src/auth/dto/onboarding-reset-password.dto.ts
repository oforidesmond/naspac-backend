import { IsOptional, IsString, MinLength } from 'class-validator';

export class OnboardingResetPasswordDto {
  @IsString()
  nssNumber: string;

  @IsString()
  token: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @MinLength(8)
  confirmPassword: string;

  @IsString()
  @IsOptional()
  captchaToken?: string;
}
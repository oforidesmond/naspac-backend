import { IsOptional, IsString, MinLength } from 'class-validator';

export class ForgotPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @IsOptional()
  captchaToken?: string;
}
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class RequestForgotPasswordDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  captchaToken?: string;
}
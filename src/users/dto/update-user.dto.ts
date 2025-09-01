import { IsOptional, IsString, IsEmail, IsEnum } from 'class-validator';
import { Role } from '@prisma/client';

export class UpdateStaffDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  staffId?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  enable2FA?: boolean;
}
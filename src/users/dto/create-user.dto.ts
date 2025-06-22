import { IsString, IsEmail, IsEnum, IsOptional } from 'class-validator';
import { Role } from '@prisma/client';

export class CreateUserDto {
   @IsString()
  @IsOptional()
  nssNumber?: string;

  @IsString()
  @IsOptional()
  staffId?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  password?: string;

  @IsEnum(Role)
  role: Role;
}
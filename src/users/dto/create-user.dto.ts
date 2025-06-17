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
  email: string;

  @IsString()
  password: string;

  @IsEnum(Role)
  role: Role;
}
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
  name?: string;

  @IsString()
  @IsOptional()
  password?: string;

  @IsEnum(Role)
  role: Role;
}

export class InitUserDto {
  @IsString()
  staffId: string;

  @IsEmail()
  email: string;

  @IsString()
  name: string; // Added name field

  @IsEnum(Role, { message: 'Role must be STAFF, ADMIN, or SUPERVISOR' })
  role: 'STAFF' | 'ADMIN' | 'SUPERVISOR';
}
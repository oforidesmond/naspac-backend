import { IsString, IsEmail, IsEnum, IsOptional, IsInt, IsArray, IsNotEmpty } from 'class-validator';
import { Role, SubmissionStatus } from '@prisma/client';

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

export class CreateDepartmentDto {
  @IsString()
  name: string;

  @IsInt()
  supervisorId: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  unitIds?: number[];
}

export class GetPersonnelDto {
  @IsOptional()
  @IsArray()
  @IsEnum(SubmissionStatus, { each: true })
  statuses?: SubmissionStatus[];
}

export class AssignPersonnelToDepartmentDto {
  @IsArray()
  @IsInt({ each: true })
  @IsNotEmpty()
  submissionIds: number[];

  @IsInt()
  @IsNotEmpty()
  departmentId: number;
}
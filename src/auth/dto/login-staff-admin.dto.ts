import { IsString } from 'class-validator';

export class LoginStaffAdminDto {
  @IsString()
  staffId: string;

  @IsString()
  password: string;

  @IsString()
  captchaToken: string;
}
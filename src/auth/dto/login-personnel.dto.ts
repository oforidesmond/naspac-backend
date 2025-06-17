import { IsString } from 'class-validator';

export class LoginPersonnelDto {
  @IsString()
  nssNumber: string;

  @IsString()
  password: string;

  @IsString()
  captchaToken: string;
}
import { IsString, IsNotEmpty } from 'class-validator';

export class TwoFaDto {
  @IsString()
  @IsNotEmpty()
  tfaToken: string;
}
import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class CaptchaGuard implements CanActivate {
  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const captchaToken = request.body.captchaToken;

    if (!captchaToken) {
      throw new HttpException('CAPTCHA token missing', HttpStatus.BAD_REQUEST);
    }

    const response = await firstValueFrom(
      this.httpService.post(
        'https://www.google.com/recaptcha/api/siteverify',
        `secret=${this.configService.get('CAPTCHA_SECRET')}&response=${captchaToken}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      ),
    );

    if (!response.data.success) {
      throw new HttpException('Invalid CAPTCHA', HttpStatus.BAD_REQUEST);
    }

    return true;
  }
}
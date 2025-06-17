import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RateLimitGuard } from './rate-limit.guard';
import { CaptchaGuard } from './captcha.guard';

import { Roles } from '../common/decorators/roles.decorator';
import { InitOnboardingDto } from '../users/dto/init-onboarding.dto';
import { JwtAuthGuard } from 'src/common/guards/auth-guard';
import { RolesGuard } from 'src/common/guards/roles-guard';
import { LoginStaffAdminDto } from './dto/login-staff-admin.dto';
import { LoginPersonnelDto } from './dto/login-personnel.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

    @Post('login-personnel')
  @UseGuards(RateLimitGuard, CaptchaGuard)
  async loginPersonnel(@Body() body: LoginPersonnelDto) {
    return this.authService.login(body.nssNumber, body.password);
  }

  @Post('login-staff-admin')
  @UseGuards(RateLimitGuard, CaptchaGuard)
  async loginStaffAdmin(@Body() body: LoginStaffAdminDto) {
    return this.authService.login(body.staffId, body.password);
  }

  @Post('init-onboarding')
  @UseGuards(JwtAuthGuard, RolesGuard, RateLimitGuard, CaptchaGuard)
  @Roles('STAFF', 'ADMIN')
  async initOnboarding(@Body() body: InitOnboardingDto, @Request() req) {
    return this.authService.initOnboarding(body.nssNumber, body.email, req.user);
  }
}
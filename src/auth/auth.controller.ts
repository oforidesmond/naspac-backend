import { Controller, Post, Body, UseGuards, Request, Get, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RateLimitGuard } from './rate-limit.guard';
import { CaptchaGuard } from './captcha.guard';

import { Roles } from '../common/decorators/roles.decorator';
import { InitOnboardingDto } from '../users/dto/init-onboarding.dto';
import { JwtAuthGuard } from 'src/common/guards/auth-guard';
import { RolesGuard } from 'src/common/guards/roles-guard';
import { LoginStaffAdminDto } from './dto/login-staff-admin.dto';
import { LoginPersonnelDto } from './dto/login-personnel.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { RequestForgotPasswordDto } from './dto/request-forgot-password.dto';
import { OnboardingResetPasswordDto } from './dto/onboarding-reset-password.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login-personnel')
  @UseGuards(RateLimitGuard)
  async loginPersonnel(@Body() body: LoginPersonnelDto) {
    return this.authService.loginPersonnel(body.nssNumber, body.password);
  }

  @Post('login-staff-admin')
  @UseGuards(RateLimitGuard)
  async loginStaffAdmin(@Body() body: LoginStaffAdminDto) {
    return this.authService.loginStaffAdmin(body.staffId, body.password);
  }

    @Get('validate')
  @UseGuards(JwtAuthGuard)
  async validateToken(@Req() req: any) {
    return { success: true, role: req.user.role, email: req.user.email };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout() {
    // Optional: Add server-side token invalidation (e.g., blacklist)
    return { success: true, message: 'Logged out successfully' };
  }

  @Post('init-onboarding')
  @UseGuards(JwtAuthGuard, RolesGuard, RateLimitGuard)
  @Roles('STAFF', 'ADMIN')
  async initOnboarding(@Body() body: InitOnboardingDto, @Request() req) {
    return this.authService.initOnboarding(body.nssNumber, body.email, req.user);
  }

   @Post('request-forgot-password')
  @UseGuards(RateLimitGuard)
  async requestForgotPassword(@Body() body: RequestForgotPasswordDto) {
    return this.authService.requestForgotPassword(body.email);
  }

  @Post('forgot-password')
  @UseGuards(RateLimitGuard)
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.forgotPassword(body.token, body.password);
  }

  @Post('onboarding-reset-password')
  @UseGuards(RateLimitGuard)
  async onboardingResetPassword(@Body() body: OnboardingResetPasswordDto) {
    return this.authService.onboardingResetPassword(
      body.nssNumber,
      body.token,
      body.password,
      body.confirmPassword,
    );
  }
}
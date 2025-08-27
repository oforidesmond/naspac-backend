import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { NotificationsService } from 'src/notifications/notifications.service';
import { PrismaService } from 'prisma/prisma.service';
import { SmsService } from './sms.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private notificationsService: NotificationsService,
    private prisma: PrismaService,
    private smsService: SmsService,
  ) {}

  // Validate STAFF or ADMIN user
  async validateStaffAdmin(staffId: string, password: string): Promise<any> {
    const user = await this.usersService.findByStaffId(staffId);

    if (!user) {
      throw new HttpException('Invalid staff ID or password', HttpStatus.UNAUTHORIZED);
    }

    if (user.role !== 'STAFF' && user.role !== 'ADMIN' && user.role !== 'SUPERVISOR') {
      throw new HttpException(
        'Access denied. Only Staff or Admin roles are allowed.',
        HttpStatus.FORBIDDEN,
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new HttpException('Invalid staff ID or password', HttpStatus.UNAUTHORIZED);
    }

    return { id: user.id, staffId: user.staffId, role: user.role, email: user.email , name: user.name, phoneNumber: user.phoneNumber};
  }

 async validatePersonnel(nssNumber: string, password: string): Promise<any> {
  let user = await this.usersService.findByNssNumber(nssNumber);

  // try with current year appended
  if (!user) {
    const currentYear = new Date().getFullYear();
    const nssNumberWithYear = `${nssNumber}${currentYear}`;
    user = await this.usersService.findByNssNumber(nssNumberWithYear);
  }

  if (!user) {
    throw new HttpException('Invalid NSS number or password', HttpStatus.UNAUTHORIZED);
  }

  if (user.role !== 'PERSONNEL') {
    throw new HttpException(
      'Access denied. Only Personnel role is allowed.',
      HttpStatus.FORBIDDEN,
    );
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw new HttpException('Invalid NSS number or password', HttpStatus.UNAUTHORIZED);
  }

  const submission = await this.prisma.submission.findUnique({
      where: { userId_nssNumber: { userId: user.id, nssNumber: user.nssNumber } },
    });
    return {
      id: user.id,
      nssNumber: user.nssNumber,
      role: user.role,
      email: user.email,
      name: user.name,
      phoneNumber: user.phoneNumber || submission?.phoneNumber,
  };
}

async loginStaffAdmin(staffId: string, password: string) {
     const user = await this.validateStaffAdmin(staffId, password);
    if (!user.phoneNumber) {
      throw new HttpException('Phone number not set. Please update your profile.', HttpStatus.BAD_REQUEST);
    }
    await this.smsService.sendOtp(user.id);
    const tempPayload = { sub: user.id, identifier: user.staffId, role: user.role, name: user.name, email: user.email, isTfaRequired: true };
    return {
      tempAccessToken: this.jwtService.sign(tempPayload, { expiresIn: '5m' }),
      message: '2FA required. OTP sent to your phone.',
    };
  }

// async loginStaffAdmin(staffId: string, password: string) {
//      const user = await this.validateStaffAdmin(staffId, password);
//     if (!user.phoneNumber) {
//       throw new HttpException('Phone number not set. Please update your profile.', HttpStatus.BAD_REQUEST);
//     }
//     // await this.smsService.sendOtp(user.id);
//     const payload = { sub: user.id, identifier: user.staffId, role: user.role, name: user.name, email: user.email, isTfaRequired: true };
//      return {
//     accessToken: this.jwtService.sign(payload),
//     role: user.role,
//   };
//   }

  async loginPersonnel(nssNumber: string, password: string) {
    const user = await this.validatePersonnel(nssNumber, password);
    if (!user.phoneNumber) {
      throw new HttpException('Phone number not set. Please complete onboarding.', HttpStatus.BAD_REQUEST);
    }
    await this.smsService.sendOtp(user.id);
    const tempPayload = { sub: user.id, identifier: user.nssNumber, role: user.role, name: user.name, email: user.email || '', isTfaRequired: true };
    return {
      tempAccessToken: this.jwtService.sign(tempPayload, { expiresIn: '5m' }),
      message: '2FA required. OTP sent to your phone.',
    };
  }


//   async loginPersonnel(nssNumber: string, password: string) {
//   const user = await this.validatePersonnel(nssNumber, password);
//   if (!user.phoneNumber) {
//     throw new HttpException('Phone number not set. Please complete onboarding.', HttpStatus.BAD_REQUEST);
//   }
//   // TEMPORARY BYPASS 2FA:
//   // await this.twoFactorAuthService.sendOtp(user.id);
//   // const tempPayload = { sub: user.id, identifier: user.nssNumber, role: user.role, name: user.name, email: user.email || '', isTfaRequired: true };
//   // return {
//   //   tempAccessToken: this.jwtService.sign(tempPayload, { expiresIn: '5m' }),
//   //   message: '2FA required. OTP sent to your phone.',
//   // };
//   const payload = {
//     sub: user.id,
//     identifier: user.nssNumber,
//     role: user.role,
//     name: user.name,
//     email: user.email || '',
//     isTfaRequired: false,
//   };
//   return {
//     accessToken: this.jwtService.sign(payload),
//     role: user.role,
//   };
// }
  async verifyTfa(userId: number, token: string) {
    const isValid = await this.smsService.verifyOtp(userId, token);
    if (!isValid) {
      throw new HttpException('Invalid OTP', HttpStatus.UNAUTHORIZED);
    }
    const user = await this.usersService.findById(userId);
    if (!user.staffId && (user.role === 'STAFF' || user.role === 'ADMIN' || user.role === 'SUPERVISOR')) {
    throw new HttpException('Staff ID not found', HttpStatus.INTERNAL_SERVER_ERROR);
  }
    const identifier = user.role === 'PERSONNEL' ? user.nssNumber : user.staffId;
  if (!identifier) {
    throw new HttpException('User identifier not found', HttpStatus.INTERNAL_SERVER_ERROR);
  }
    const payload = {
      sub: user.id,
      identifier,
      role: user.role,
      name: user.name,
      email: user.email || '',
      isTfaRequired: false,
    };
    return {
      accessToken: this.jwtService.sign(payload),
      role: user.role,
    };
  }

  async validateToken(user: any) {
    return { success: true, userId: user.id, role: user.role, email: user.email, name: user.name };
  }

 async initOnboarding(nssNumber: string, email: string, initiatedBy: { id: number; role: string }, phoneNumber: string) {
    if (!['STAFF', 'ADMIN'].includes(initiatedBy.role)) {
      throw new HttpException('Unauthorized: Only staff or admins can initiate onboarding', HttpStatus.FORBIDDEN);
    }

     if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpException('Invalid email address', HttpStatus.BAD_REQUEST);
  }
    const existingUser = await this.usersService.findByNssNumberOrStaffId(nssNumber);
    if (existingUser) {
      throw new HttpException('NSS number already registered', HttpStatus.BAD_REQUEST);
    }

    const currentYear = new Date().getFullYear();
    const nssNumberWithYear = `${nssNumber}${currentYear}`;

    const user = await this.usersService.createUser({
      nssNumber: nssNumberWithYear,
      email,
      phoneNumber,
      role: 'PERSONNEL',
    });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour expiry

    await this.prisma.onboardingToken.create({
      data: {
        token,
        nssNumber: nssNumberWithYear,
        userId: user.id,
        expiresAt,
      },
    });

    await this.notificationsService.sendOnboardingEmail(email, nssNumberWithYear, token);

    return { message: 'Onboarding link sent to email', email };
  }

  async onboardingResetPassword(nssNumber: string, token: string, password: string, confirmPassword: string) {
    if (password !== confirmPassword) {
      throw new HttpException('Passwords do not match', HttpStatus.BAD_REQUEST);
    }

    const onboardingToken = await this.prisma.onboardingToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (
      !onboardingToken ||
      onboardingToken.nssNumber !== nssNumber ||
      onboardingToken.used ||
      onboardingToken.expiresAt < new Date()
    ) {
      throw new HttpException('Invalid or expired token', HttpStatus.BAD_REQUEST);
    }

    if (onboardingToken.user.password) {
      throw new HttpException('Password already set for this account', HttpStatus.BAD_REQUEST);
    }

    await this.usersService.updateUser(onboardingToken.userId, { password });

    await this.prisma.onboardingToken.update({
      where: { token },
      data: { used: true },
    });

    return { message: 'Password set successfully' };
  }

  async requestForgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      return { message: 'If an account exists, a reset link will be sent' };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour expiry

    await this.prisma.passwordResetToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt,
      },
    });

    await this.notificationsService.sendForgotPasswordEmail(email, token);

    return { message: 'If an account exists, a reset link will be sent' };
  }

  async forgotPassword(token: string, password: string) {
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetToken || resetToken.expiresAt < new Date()) {
      throw new HttpException('Invalid or expired token', HttpStatus.BAD_REQUEST);
    }

    await this.usersService.updateUser(resetToken.userId, { password });

    await this.prisma.passwordResetToken.delete({ where: { token } });

    return { message: 'Password reset successfully' };
  }

  async initUser(staffId: string, email: string, name: string, role: 'STAFF' | 'ADMIN' | 'SUPERVISOR', initiatedBy: { id: number; role: string }, phoneNumber?: string) {

  if (initiatedBy.role !== 'ADMIN') {
    throw new HttpException('Unauthorized: Only admins can initiate user creation', HttpStatus.FORBIDDEN);
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpException('Invalid email address', HttpStatus.BAD_REQUEST);
  }
  if (!phoneNumber || !/^\+\d{10,15}$/.test(phoneNumber)) {
    throw new HttpException('Valid phone number with country code required (e.g., +233557484584)', HttpStatus.BAD_REQUEST);
  }

  const existingUser = await this.usersService.findByNssNumberOrStaffId(staffId);
  if (existingUser) {
    throw new HttpException('Staff ID already registered', HttpStatus.BAD_REQUEST);
  }
  const existingEmail = await this.usersService.findByEmail(email);
  if (existingEmail) {
    throw new HttpException('Email already registered', HttpStatus.BAD_REQUEST);
  }
  const existingPhone = await this.usersService.findByPhoneNumber(phoneNumber);
  if (existingPhone) {
    throw new HttpException('Phone number already registered', HttpStatus.BAD_REQUEST);
  }

  if (!['STAFF', 'ADMIN', 'SUPERVISOR'].includes(role)) {
    throw new HttpException('Invalid role: Must be STAFF, ADMIN, or SUPERVISOR', HttpStatus.BAD_REQUEST);
  }

  const user = await this.usersService.createUser({
   staffId,
    email,
    name,
    role,
    phoneNumber,
  });

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000);

  await this.prisma.onboardingToken.create({
    data: {
      token,
      nssNumber: staffId,
      userId: user.id,
      expiresAt,
    },
  });

  await this.notificationsService.sendOnboardingEmail(email, staffId, token);

  return { message: 'Onboarding link sent to email', email };
  }

  async resendOtp(userId: number) {
  const user = await this.usersService.findById(userId);
  if (!user) {
    throw new HttpException('User not found', HttpStatus.BAD_REQUEST);
  }
  await this.smsService.sendOtp(userId);
  return { message: 'OTP resent to your phone' };
  }
}
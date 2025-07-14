import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { NotificationsService } from 'src/notifications/notifications.service';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private notificationsService: NotificationsService,
    private prisma: PrismaService,
  ) {}

  // Validate STAFF or ADMIN user
  async validateStaffAdmin(staffId: string, password: string): Promise<any> {
    const user = await this.usersService.findByStaffId(staffId); // Specific method for staffId

    if (!user) {
      throw new HttpException('Invalid staff ID or password', HttpStatus.UNAUTHORIZED);
    }

    // Restrict to STAFF or ADMIN roles
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

    return { id: user.id, staffId: user.staffId, role: user.role };
  }

  // Validate PERSONNEL user
 async validatePersonnel(nssNumber: string, password: string): Promise<any> {
  let user = await this.usersService.findByNssNumber(nssNumber);

  // If not found, try with current year appended
  if (!user) {
    const currentYear = new Date().getFullYear();
    const nssNumberWithYear = `${nssNumber}${currentYear}`;
    user = await this.usersService.findByNssNumber(nssNumberWithYear);
  }

  if (!user) {
    throw new HttpException('Invalid NSS number or password', HttpStatus.UNAUTHORIZED);
  }

  // Restrict to PERSONNEL role
  if (user.role !== 'PERSONNEL') {
    throw new HttpException(
      'Access denied. Only Personnel role is allowed.',
      HttpStatus.FORBIDDEN,
    );
  }

  // Validate password
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw new HttpException('Invalid NSS number or password', HttpStatus.UNAUTHORIZED);
  }

  return { id: user.id, nssNumber: user.nssNumber, role: user.role, email: user.email };
}
  // Login for STAFF or ADMIN
  async loginStaffAdmin(staffId: string, password: string) {
    const user = await this.validateStaffAdmin(staffId, password);
    const payload = { sub: user.id, identifier: user.staffId, role: user.role, email: user.email };
    return {
      accessToken: this.jwtService.sign(payload),
      role: user.role,
    };
  }

  // Login for PERSONNEL
  async loginPersonnel(nssNumber: string, password: string) {
    const user = await this.validatePersonnel(nssNumber, password);
    const payload = { sub: user.id, identifier: user.nssNumber, role: user.role, email: user.email || ''};
    return {
      accessToken: this.jwtService.sign(payload),
    };
  }

  async validateToken(user: any) {
    // User is already validated by JwtAuthGuard
    return { success: true, role: user.role, email: user.email };
  }

 async initOnboarding(nssNumber: string, email: string, initiatedBy: { id: number; role: string }) {
    // Restrict to STAFF or ADMIN roles
    if (!['STAFF', 'ADMIN'].includes(initiatedBy.role)) {
      throw new HttpException('Unauthorized: Only staff or admins can initiate onboarding', HttpStatus.FORBIDDEN);
    }

     if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpException('Invalid email address', HttpStatus.BAD_REQUEST);
  }
    // Check if NSS number already exists
    const existingUser = await this.usersService.findByNssNumberOrStaffId(nssNumber);
    if (existingUser) {
      throw new HttpException('NSS number already registered', HttpStatus.BAD_REQUEST);
    }

    // Create new user without password
    const currentYear = new Date().getFullYear();
    const nssNumberWithYear = `${nssNumber}${currentYear}`;

    const user = await this.usersService.createUser({
      nssNumber: nssNumberWithYear,
      email,
      role: 'PERSONNEL',
    });

    // Generate onboarding token
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

    // Queue onboarding email
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

    // Check if user already has a password
    if (onboardingToken.user.password) {
      throw new HttpException('Password already set for this account', HttpStatus.BAD_REQUEST);
    }

    // Update user password
    await this.usersService.updateUser(onboardingToken.userId, { password });

    // Mark token as used
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

    // Generate reset token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour expiry

    // Store token
    await this.prisma.passwordResetToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt,
      },
    });

    // Queue reset email
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

    // Update user password
    await this.usersService.updateUser(resetToken.userId, { password });

    // Delete used token
    await this.prisma.passwordResetToken.delete({ where: { token } });

    return { message: 'Password reset successfully' };
  }

  async initUser(staffId: string, email: string, name: string, role: 'STAFF' | 'ADMIN' | 'SUPERVISOR', initiatedBy: { id: number; role: string }) {
  // Restrict to ADMIN role
  if (initiatedBy.role !== 'ADMIN') {
    throw new HttpException('Unauthorized: Only admins can initiate user creation', HttpStatus.FORBIDDEN);
  }

  // Validate email
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpException('Invalid email address', HttpStatus.BAD_REQUEST);
  }

  // Check if staffId or email already exists
  const existingUser = await this.usersService.findByNssNumberOrStaffId(staffId);
  if (existingUser) {
    throw new HttpException('Staff ID already registered', HttpStatus.BAD_REQUEST);
  }
  const existingEmail = await this.usersService.findByEmail(email);
  if (existingEmail) {
    throw new HttpException('Email already registered', HttpStatus.BAD_REQUEST);
  }

  // Validate role
  if (!['STAFF', 'ADMIN', 'SUPERVISOR'].includes(role)) {
    throw new HttpException('Invalid role: Must be STAFF, ADMIN, or SUPERVISOR', HttpStatus.BAD_REQUEST);
  }

  // Create new user without password
  const user = await this.usersService.createUser({
   staffId,
    email,
    name,
    role,
  });

  // Generate onboarding token
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour expiry

  await this.prisma.onboardingToken.create({
    data: {
      token,
      nssNumber: staffId, // Using staffId as identifier in token for non-PERSONNEL
      userId: user.id,
      expiresAt,
    },
  });

  // Queue onboarding email
  await this.notificationsService.sendOnboardingEmail(email, staffId, token);

  return { message: 'Onboarding link sent to email', email };
  }
}
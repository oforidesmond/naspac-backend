import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';
import { NotificationsService } from 'src/notifications/notifications.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private notificationsService: NotificationsService,
  ) {}

  async validateUser(nssNumber: string, password: string): Promise<any> {
    const user = await this.usersService.findByNssNumber(nssNumber);
    if (!user) {
      throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
    }

    return { id: user.id, nssNumber: user.nssNumber, role: user.role };
  }

  async login(nssNumber: string, password: string) {
    const user = await this.validateUser(nssNumber, password);
    const payload = { sub: user.id, nssNumber: user.nssNumber, role: user.role };
    return {
      accessToken: this.jwtService.sign(payload),
    };
  }

  async initOnboarding(nssNumber: string, email: string, initiatedBy: { id: number; role: string }) {
    // Restrict to STAFF or ADMIN roles
    if (!['STAFF', 'ADMIN'].includes(initiatedBy.role)) {
      throw new HttpException('Unauthorized: Only staff or admins can initiate onboarding', HttpStatus.FORBIDDEN);
    }

    // Check if NSS number already exists
    const existingUser = await this.usersService.findByNssNumber(nssNumber);
    if (existingUser) {
      throw new HttpException('NSS number already registered', HttpStatus.BAD_REQUEST);
    }

    // Generate temporary password
    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // Create new user with PERSONNEL role
    await this.usersService.createUser({
      nssNumber,
      email,
      password: hashedPassword,
      role: 'PERSONNEL',
    });

    // Queue onboarding email
    await this.notificationsService.sendOnboardingEmail(email, tempPassword);

    return { message: 'Onboarding link sent to email', email };
  }
}
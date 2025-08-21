import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { authenticator } from 'otplib';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';
import { UsersService } from 'src/users/users.service';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class SmsService {
  constructor(
    private usersService: UsersService,
    private httpService: HttpService,
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    authenticator.options = { step: 60 };
  }

  // Generate a TOTP secret for a user
  async generateTfaSecret(userId: number): Promise<string> {
    const secret = authenticator.generateSecret(); // Generate a 32-character base32 secret
    await this.usersService.updateUser(userId, { tfaSecret: secret });
    return secret;
  }

  // Send OTP via Hubtel SMS API
  async sendOtp(userId: number): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { submissions: true },
    });
    if (!user) {
      throw new HttpException('User not found', HttpStatus.BAD_REQUEST);
    }

     let phoneNumber = user.phoneNumber;
    if (!phoneNumber && user.role === 'PERSONNEL') {
      const submission = user.submissions[0];
      phoneNumber = submission?.phoneNumber;
    }

    if (!phoneNumber) {
      throw new HttpException('Phone number not set for user', HttpStatus.BAD_REQUEST);
    }
    if (!user.tfaSecret) {
      throw new HttpException('2FA not set up for user', HttpStatus.BAD_REQUEST);
    }

    const otp = authenticator.generate(user.tfaSecret); // Generate 6-digit OTP
    const clientId = this.configService.get<string>('HUBTEL_CLIENT_ID');
    const clientSecret = this.configService.get<string>('HUBTEL_CLIENT_SECRET');
    const sender = this.configService.get<string>('HUBTEL_SENDER');

    const url = 'https://smsc.hubtel.com/v1/messages/send';
    const params = {
      clientid: clientId,
      clientsecret: clientSecret,
      from: sender,
      to: phoneNumber,
      content: `Your OTP is ${otp}. It expires in 60 seconds.`,
    };

    try {
      await lastValueFrom(this.httpService.get(url, { params }));
    } catch (error) {
      throw new HttpException('Failed to send OTP via SMS', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // Verify OTP
  async verifyOtp(userId: number, token: string): Promise<boolean> {
    const user = await this.usersService.findById(userId);
    if (!user || !user.tfaSecret) {
      throw new HttpException('User not found or 2FA not set up', HttpStatus.BAD_REQUEST);
    }
    return authenticator.verify({ token, secret: user.tfaSecret });
  }
}
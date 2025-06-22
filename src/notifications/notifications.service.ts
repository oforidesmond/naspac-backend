import { Injectable } from '@nestjs/common';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';

@Injectable()
export class NotificationsService {
  constructor(@InjectQueue('email') private emailQueue: Queue) {}

  async sendOnboardingEmail(to: string, nssNumber: string, token: string) {
    await this.emailQueue.add(
      'send-email',
      {
        to,
        subject: 'COCOBOD NSS Onboarding',
        content: `
          <h1>Welcome to COCOBOD NSS Onboarding!</h1>
          <p>Click <a href="http://localhost:5173/reset-password?nssNumber=${nssNumber}&token=${token}">here</a> to set your password and begin onboarding.</p>
          <p>This link expires in 1 hour.</p>
        `,
      },
      {
        attempts: 3,
        backoff: 5000,
      },
    );
  }

  async sendForgotPasswordEmail(to: string, token: string) {
    await this.emailQueue.add(
      'send-email',
      {
        to,
        subject: 'COCOBOD Password Reset',
        content: `
          <h1>Password Reset Request</h1>
          <p>You requested to reset your password.</p>
          <p>Click <a href="http://localhost:3000/forgot-password?token=${token}">here</a> to reset your password.</p>
          <p>This link expires in 1 hour.</p>
        `,
      },
      {
        attempts: 3,
        backoff: 5000,
      },
    );
  }
}
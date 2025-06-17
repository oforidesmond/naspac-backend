import { Injectable } from '@nestjs/common';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';

@Injectable()
export class NotificationsService {
  constructor(@InjectQueue('email') private emailQueue: Queue) {}

  async sendOnboardingEmail(to: string, tempPassword: string) {
    await this.emailQueue.add('send-email', {
      to,
      subject: 'COCOBOD NSS Onboarding Link',
      content: `
        <h1>Welcome to COCOBOD NSS Onboarding!</h1>
        <p>Your temporary password is: <strong>${tempPassword}</strong></p>
        <p>Click <a href="http://yourdomain.com/reset-password">here</a> to reset your password and begin onboarding.</p>
      `,
    });
  }
}
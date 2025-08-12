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
        subject: 'Welcome to NASPAC!',
        content: `
          <h1>Welcome to NASPAC</h1>
          <p>Click <a href="http://localhost:5173/reset-password?nssNumber=${nssNumber}&token=${token}">here</a> to set your password to access your dashboard.</p>
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
        subject: 'NASPAC Password Reset',
        content: `
          <h1>Password Reset Request</h1>
          <p>You requested to reset your password.</p>
          <p>Click <a href="http://localhost:5173/reset-password?token=${token}">here</a> to reset your password.</p>
          <p>This link expires in 1 hour.</p>
        `,
      },
      {
        attempts: 3,
        backoff: 5000,
      },
    );
  }

  async sendSubmissionConfirmationEmail(to: string, fullName: string) {
  await this.emailQueue.add(
    'send-email',
    {
      to,
      subject: 'Onboarding Submission Confirmation',
      content: `
        <h1>Thank You for Your Submission!</h1>
        <p>Dear ${fullName},</p>
        <p>Your onboarding submission has been successfully received.</p>
        <p>We will review it and notify you of any updates. If you have any questions, please contact our support team.</p>
        <p>Best regards,<br>NASPAC Team</p>
      `,
    },
    {
      attempts: 3,
      backoff: 5000,
      }
    );
  }

  async sendSupervisorAssignmentEmail(to: string, supervisorName: string, departmentName: string) {
  await this.emailQueue.add(
    'send-email',
    {
      to,
      subject: 'NSP Supervisor Assignment',
      content: `
        <h1>Supervisor Assignment Notification</h1>
        <p>Dear ${supervisorName},</p>
        <p>You have been assigned as the supervisor over NSPs for the <strong>${departmentName}</strong> department.</p>
        <p>Please review your responsibilities and contact the administration if you have any questions.</p>
        <p>Best regards,<br>NASPAC Administration Team</p>
      `,
    },
    {
      attempts: 3,
      backoff: 5000,
      }
   );
  }

async sendVerificationFormEmail(
  to: string,
  staffName: string,
  personnelName: string,
  nssNumber: string,
  submissionId: number
) {
  await this.emailQueue.add(
    'send-email',
    {
      to,
      subject: 'NSP Verification Form Submission',
      content: `
        <h1>New Verification Form Submission</h1>
        <p>Dear ${staffName},</p>
        <p>A verification form has been submitted by ${personnelName} (NSS: ${nssNumber}) for Submission ID: ${submissionId}.</p>
        <p>Please review the submission in your dashboard and take appropriate action.</p>
        <p>Best regards,<br>NASPAC Administration Team</p>
      `,
    },
    {
      attempts: 3,
      backoff: 5000,
    }
  );
}

async sendDocumentEndorsedEmail(
  to: string,
  personnelName: string,
  nssNumber: string,
  submissionId: number
) {
  await this.emailQueue.add(
    'send-email',
    {
      to,
      subject: 'Appointment Letter Endorsement Notification',
      content: `
        <h1>Appointment Letter Endorsement Notification</h1>
        <p>Dear ${personnelName},</p>
        <p>Your appointment letter has been successfully endorsed.</p>
        <p>Please check your dashboard for further details or contact the administration if you have any questions.</p>
        <p>Best regards,<br>NASPAC Administration Team</p>
      `,
    },
    {
      attempts: 3,
      backoff: 5000,
    }
  );
}
}
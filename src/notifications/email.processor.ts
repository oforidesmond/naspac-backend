import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import * as nodemailer from 'nodemailer';

@Processor('email')
export class EmailProcessor {
  private transporter = nodemailer.createTransport({
    host: process.env.NODEMAILER_HOST,
    port: Number(process.env.NODEMAILER_PORT),
    secure: false, // Use TLS
    auth: {
      user: process.env.NODEMAILER_USER,
      pass: process.env.NODEMAILER_PASS,
    },
  });

  @Process('send-email')
  async sendEmail(job: Job<{ to: string; subject: string; content: string }>) {
    try {
      await this.transporter.sendMail({
        from: '"COCOBOD Onboarding"',
        to: job.data.to,
        subject: job.data.subject,
        html: job.data.content,
      });
      console.log(`Email sent to ${job.data.to}`);
    } catch (error) {
      console.error(`Failed to send email to ${job.data.to}:`, error);
      throw error; // Trigger Bull retry mechanism
    }
  }
}
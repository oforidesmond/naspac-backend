import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import * as nodemailer from 'nodemailer';
@Processor('email')
export class EmailProcessor {
  private transporter = nodemailer.createTransport({
    host: process.env.NODEMAILER_HOST,
    port: Number(process.env.NODEMAILER_PORT),
    auth: {
      user: process.env.NODEMAILER_EMAIL,
      pass: process.env.NODEMAILED_PASS,
    },
  });

  @Process('send-email')
  async sendEmail(job: Job<{ to: string; subject: string; content: string }>) {
    await this.transporter.sendMail({
      from: '"COCOBOD Onboarding" <no-reply@yourdomain.com>',
      to: job.data.to,
      subject: job.data.subject,
      html: job.data.content,
    });
  }
}
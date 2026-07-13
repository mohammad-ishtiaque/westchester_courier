import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

// Mirrors the template's emailHelpers.ts (activation / OTP-resend / reset-password emails)
// with one deliberate difference: if SMTP isn't configured or sending fails, we log a
// warning and MOVE ON instead of throwing. Reasoning: registration/login shouldn't hard-fail
// just because email delivery had a hiccup, and it means this module is testable in Postman
// without a real SMTP account. See AuthService for how the OTP is also surfaced in the API
// response in non-production environments for the same testability reason.
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    const user = this.configService.get<string>('SMTP_MAIL');
    const pass = this.configService.get<string>('SMTP_PASSWORD');

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(this.configService.get<string>('SMTP_PORT') ?? 587),
        service: this.configService.get<string>('SMTP_SERVICE'),
        auth: { user, pass },
      });
    }
  }

  private async send(email: string, subject: string, html: string) {
    if (!this.transporter) {
      this.logger.warn(
        `SMTP not configured — skipping real email send. Would have sent "${subject}" to ${email}.`,
      );
      return;
    }
    try {
      await this.transporter.sendMail({
        from: this.configService.get<string>('SMTP_MAIL'),
        to: email,
        subject,
        html,
      });
    } catch (error) {
      this.logger.error(`Failed to send email to ${email}`, error as Error);
    }
  }

  async sendActivationEmail(email: string, name: string, code: string, expiresInMinutes: number) {
    await this.send(
      email,
      'Activate Your Account',
      `<p>Hi ${name},</p><p>Your activation code is <b>${code}</b>. It expires in ${expiresInMinutes} minutes.</p>`,
    );
  }

  async sendOtpResendEmail(email: string, name: string, code: string, expiresInMinutes: number) {
    await this.send(
      email,
      'New Activation Code',
      `<p>Hi ${name},</p><p>Your new activation code is <b>${code}</b>. It expires in ${expiresInMinutes} minutes.</p>`,
    );
  }

  async sendResetPasswordEmail(email: string, name: string, code: string, expiresInMinutes: number) {
    await this.send(
      email,
      'Password Reset Code',
      `<p>Hi ${name},</p><p>Your password reset code is <b>${code}</b>. It expires in ${expiresInMinutes} minutes.</p>`,
    );
  }
}

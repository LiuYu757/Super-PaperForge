import nodemailer from 'nodemailer';
import { env } from './env';

const smtpPort = Number.parseInt(env.SMTP_PORT, 10);
const hasValidPort = Number.isFinite(smtpPort) && smtpPort > 0;
const resolvedSmtpPort = hasValidPort ? smtpPort : 587;

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST || 'localhost',
  port: resolvedSmtpPort,
  secure: env.SMTP_SECURE || resolvedSmtpPort === 465,
  auth:
    env.SMTP_USER && env.SMTP_PASS
      ? {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        }
      : undefined,
});

/**
 * Send an email using the configured SMTP transport.
 * Errors are caught and logged — callers should not break on email failure
 * since email is a best-effort notification.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  try {
    await transporter.sendMail({
      from: env.SMTP_FROM || 'noreply@paperforge.dev',
      to,
      subject,
      html,
    });
    return true;
  } catch (error) {
    console.error(`[email] Failed to send to ${to}:`, error instanceof Error ? error.message : error);
    return false;
  }
}

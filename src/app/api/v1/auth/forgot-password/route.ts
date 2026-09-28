import { headers } from 'next/headers';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createSignedToken } from '@/lib/jwt-utils';
import { sendEmail } from '@/lib/email';
import { errorResponse } from '@/lib/errors';
import { emailTemplate, buttonHtml, escapeHtml } from '@/lib/email-templates';
import { checkRateLimit, getClientIp, rateLimitHeaders } from '@/lib/rate-limit';
import { apiError, apiSuccess } from '@/lib/api-response';
import { RATE_LIMITS } from '@/lib/constants';
import { logAuditAction } from '@/services/audit-service';
import { getAppBaseUrl } from '@/lib/app-url';

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export async function POST(request: Request) {
  try {
    const headersList = await headers();

    // Per-IP rate limit: 5 per 15 minutes
    const ip = getClientIp(headersList as unknown as Headers);
    const ipRateLimit = await checkRateLimit(`rate:forgot-pw:${ip}`, RATE_LIMITS.FORGOT_PASSWORD.limit, RATE_LIMITS.FORGOT_PASSWORD.windowSeconds);
    if (!ipRateLimit.allowed) {
      return apiError('Too many attempts. Please try again later.', 429, 'RATE_LIMITED', {
        ...rateLimitHeaders(RATE_LIMITS.FORGOT_PASSWORD.limit, ipRateLimit),
      });
    }

    const reqBody = await request.json();
    const { email } = forgotPasswordSchema.parse(reqBody);

    // Per-email rate limit: 3 per hour — silently drop to prevent inbox bombing
    // without leaking whether the address is registered (same response as no-op).
    const emailRateLimit = await checkRateLimit(`rate:forgot-pw-email:${email.toLowerCase()}`, RATE_LIMITS.FORGOT_PASSWORD_EMAIL.limit, RATE_LIMITS.FORGOT_PASSWORD_EMAIL.windowSeconds);
    if (!emailRateLimit.allowed) {
      return apiSuccess({ message: 'If an account with that email exists, a reset link has been sent.' });
    }

    // Always return 200 to prevent email enumeration.
    // Fire-and-forget to normalize response timing — prevents a timing
    // side-channel that reveals whether an account exists.
    const user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      const token = createSignedToken(
        { sub: user.id, purpose: 'password-reset' },
        '1h',
      );

      const baseUrl = getAppBaseUrl();
      const resetUrl = `${baseUrl}/reset-password?token=${token}`;

      const body = `
        <p style="margin:0 0 12px;color:#3f3f46">Hi ${escapeHtml(user.name ?? 'there')},</p>
        <p style="margin:0 0 12px;color:#3f3f46">We received a request to reset your password. Click the button below to choose a new one.</p>
        ${buttonHtml('Reset Password', resetUrl)}
        <p style="margin:16px 0 0;font-size:13px;color:#71717a">This link expires in 1 hour. If you did not request a password reset, you can safely ignore this email.</p>
      `;
      sendEmail(
        email,
        'Reset your PaperForge password',
        emailTemplate('Password Reset', body),
      ).catch((err) => console.error('[forgot-password] Failed to send reset email:', err));

      logAuditAction(user.id, 'forgot_password', 'user', user.id, undefined, email).catch(() => {});
    }

    return apiSuccess({
      message: 'If an account with that email exists, a reset link has been sent.',
    });
  } catch (error) {
    return errorResponse(error);
  }
}

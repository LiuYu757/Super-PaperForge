import { headers } from 'next/headers';
import { registerSchema } from '@/lib/validation';
import { createUser } from '@/services/user-service';
import { createSignedToken } from '@/lib/jwt-utils';
import { sendEmail } from '@/lib/email';
import { errorResponse } from '@/lib/errors';
import { emailTemplate, buttonHtml, escapeHtml } from '@/lib/email-templates';
import { checkRateLimit, rateLimitHeaders, getClientIp } from '@/lib/rate-limit';
import { apiSuccess, apiError } from '@/lib/api-response';
import { RATE_LIMITS } from '@/lib/constants';
import { logAuditAction } from '@/services/audit-service';
import { recordCampaignAttribution } from '@/services/campaign-service';
import { getAppBaseUrl } from '@/lib/app-url';

export async function POST(request: Request) {
  try {
    // Rate limit: 5 registrations per 15 minutes per IP
    const headersList = await headers();
    const ip = getClientIp(headersList as unknown as Headers);
    const rateLimit = await checkRateLimit(`rate:register:${ip}`, RATE_LIMITS.REGISTER.limit, RATE_LIMITS.REGISTER.windowSeconds);
    if (!rateLimit.allowed) {
      return apiError('Too many registration attempts. Please try again later.', 429, 'RATE_LIMITED', {
        ...rateLimitHeaders(RATE_LIMITS.REGISTER.limit, rateLimit),
      });
    }

    const reqBody = await request.json();
    const { email, name, password } = registerSchema.parse(reqBody);

    const genericResponse = { message: 'If this email is available, a verification link has been sent.' };

    let user;
    try {
      user = await createUser(email, name, password);
    } catch {
      // Return same shape to prevent email enumeration
      return apiSuccess(genericResponse, 201);
    }

    logAuditAction(user.id, 'user.register', 'user', user.id, undefined, email).catch(() => {});
    // Capture first-touch campaign attribution (utm_* / ref) if the client sent
    // it. Fire-and-forget and idempotent so it never affects the response.
    recordCampaignAttribution(user.id, reqBody).catch(() => {});

    const token = createSignedToken(
      { sub: user.id, purpose: 'email-verify' },
      '24h',
    );

    const baseUrl = getAppBaseUrl();
    const verifyUrl = `${baseUrl}/api/v1/auth/verify-email/${token}`;

    const body = `
      <p style="margin:0 0 12px;color:#3f3f46">Hi ${escapeHtml(name)},</p>
      <p style="margin:0 0 12px;color:#3f3f46">Thanks for signing up! Please verify your email address to get started.</p>
      ${buttonHtml('Verify Email', verifyUrl)}
      <p style="margin:16px 0 0;font-size:13px;color:#71717a">This link expires in 24 hours. If you did not create an account, you can safely ignore this email.</p>
    `;
    // Fire-and-forget to normalize response timing (prevents timing side-channel)
    sendEmail(
      email,
      'Verify your PaperForge email',
      emailTemplate('Welcome to PaperForge!', body),
    ).catch((err) => console.error('[register] Failed to send verification email:', err));

    // Return same shape as duplicate-email case to prevent enumeration
    return apiSuccess(genericResponse, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

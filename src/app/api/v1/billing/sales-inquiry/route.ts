import { NextRequest } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { ApiErrors, apiSuccess } from '@/lib/api-response';
import { errorResponse, ApiError } from '@/lib/errors';
import { enforceRateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';
import { env } from '@/lib/env';
import { safeString } from '@/lib/validation';
import { sendEmail } from '@/lib/email';
import { salesInquiryEmailTemplate } from '@/lib/email-templates';
import { logAuditAction } from '@/services/audit-service';

export const dynamic = 'force-dynamic';

const salesInquirySchema = z.object({
  organizationName: safeString.min(1, 'Organization is required').max(255),
  seats: z.coerce.number().int().min(2).max(10000),
  timeline: z.enum(['this-month', 'this-quarter', 'planning']),
  message: safeString.max(2000).optional().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return ApiErrors.unauthorized();

    const user = session.user as { id: string; email?: string | null; name?: string | null };
    if (!user.email) {
      throw new ApiError(400, 'A verified email is required for sales inquiries', 'EMAIL_REQUIRED');
    }

    const limited = await enforceRateLimit(
      `rate:billing-sales-inquiry:${user.id}`,
      RATE_LIMITS.BILLING_SALES_INQUIRY,
      'Too many sales inquiries. Please try again later.',
    );
    if (limited) return limited;

    const data = salesInquirySchema.parse(await request.json());
    const emailSent = await sendEmail(
      env.BILLING_CONTACT_EMAIL,
      `PaperForge Team inquiry: ${data.organizationName}`,
      salesInquiryEmailTemplate({
        requesterEmail: user.email,
        requesterName: user.name ?? user.email,
        organizationName: data.organizationName,
        seats: data.seats,
        timeline: data.timeline,
        message: data.message,
      }),
    );

    logAuditAction(user.id, 'billing.sales_inquiry', 'user', user.id, {
      organizationName: data.organizationName,
      seats: data.seats,
      timeline: data.timeline,
      emailSent,
    }).catch(() => {});

    return apiSuccess({
      received: true,
      emailSent,
      routedTo: env.BILLING_CONTACT_EMAIL,
    }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

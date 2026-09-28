import { NextRequest } from 'next/server';
import { apiSuccess, apiError } from '@/lib/api-response';
import { errorResponse } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';
import { logAuditAction } from '@/services/audit-service';
import { verifyWebhookSignature, parseBillingEvent } from '@/lib/billing-webhook';
import { applyBillingPlanToUser, resolveBillingUser } from '@/services/billing-service';

export const dynamic = 'force-dynamic';

/**
 * Payment-provider webhook. Automated counterpart to admin sales-assisted
 * provisioning: a verified `checkout.session.completed` / subscription event
 * writes `settings.billingPlan` via the shared billing service.
 *
 * Defense in depth:
 *  - 503 when no signing secret is configured (no provider → never process).
 *  - HMAC signature verification with replay-window timestamp tolerance.
 *  - Idempotency via the audit log: each provider event id is processed once.
 *  - Per-IP rate limit to throttle signature/timestamp probing.
 *
 * Unhandled-but-valid events and unknown accounts are acked with 200 so the
 * provider stops retrying; only signature/secret failures return 4xx/5xx.
 */
export async function POST(request: NextRequest) {
  try {
    const secret = env.BILLING_WEBHOOK_SECRET;
    if (!secret) {
      return apiError('Billing webhook is not configured', 503, 'WEBHOOK_NOT_CONFIGURED');
    }

    const limited = await enforceRateLimit(
      `rate:billing-webhook:${getClientIp(request.headers)}`,
      RATE_LIMITS.BILLING_WEBHOOK,
    );
    if (limited) return limited;

    // Raw body is required: signature is computed over the exact bytes sent.
    const raw = await request.text();
    const signatureHeader =
      request.headers.get('stripe-signature') ?? request.headers.get('x-billing-signature');

    const verification = verifyWebhookSignature({ payload: raw, signatureHeader, secret });
    if (!verification.valid) {
      return apiError('Invalid webhook signature', 400, 'INVALID_SIGNATURE');
    }

    let event: unknown;
    try {
      event = JSON.parse(raw);
    } catch {
      return apiError('Invalid webhook payload', 400, 'INVALID_PAYLOAD');
    }

    const parsed = parseBillingEvent(event);
    if (!parsed) {
      // Valid signature, but not an event we act on (or unknown plan).
      return apiSuccess({ received: true, handled: false, reason: 'unhandled_event' });
    }

    // Idempotency: the audit log doubles as the processed-event ledger so we
    // avoid a schema migration. A duplicate delivery is acked without re-applying.
    const already = await prisma.auditLog.findFirst({
      where: { targetType: 'billing_event', targetId: parsed.id },
      select: { id: true },
    });
    if (already) {
      return apiSuccess({ received: true, handled: false, reason: 'duplicate' });
    }

    const user = await resolveBillingUser({ userId: parsed.userId, email: parsed.email });
    if (!user) {
      // Record the attempt so the ledger reflects it, then ack (no retry helps).
      await logAuditAction(null, 'billing.webhook_processed', 'billing_event', parsed.id, {
        kind: parsed.kind,
        planId: parsed.planId,
        result: 'user_not_found',
      });
      return apiSuccess({ received: true, handled: false, reason: 'user_not_found' });
    }

    const transition = await applyBillingPlanToUser(user.id, parsed.planId);

    await logAuditAction(
      null,
      parsed.kind === 'cancel' ? 'billing.subscription_canceled' : 'billing.subscription_activated',
      'user',
      user.id,
      { plan: transition, eventId: parsed.id, source: 'webhook' },
    );
    // Idempotency marker keyed by provider event id.
    await logAuditAction(null, 'billing.webhook_processed', 'billing_event', parsed.id, {
      kind: parsed.kind,
      planId: parsed.planId,
      result: 'applied',
    });

    return apiSuccess({ received: true, handled: true, plan: transition.to });
  } catch (error) {
    return errorResponse(error);
  }
}

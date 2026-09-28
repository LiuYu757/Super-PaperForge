import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { apiSuccess, ApiErrors } from '@/lib/api-response';
import { errorResponse, ApiError } from '@/lib/errors';
import { enforceRateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';
import { env } from '@/lib/env';
import { logAuditAction } from '@/services/audit-service';
import { recordActivationEvent } from '@/services/activation-service';
import {
  type BillingCadence,
  type BillingPlan,
  PLAN_IDS,
  getBillingPlan,
} from '@/lib/billing-plans';

export const dynamic = 'force-dynamic';

const paidPlanIds = PLAN_IDS.filter((id) => id !== 'free') as ['pro', 'team'];

const checkoutSchema = z.object({
  planId: z.enum(paidPlanIds),
  cadence: z.enum(['monthly', 'annual']).default('monthly'),
});

function configuredCheckoutUrl(planId: 'pro' | 'team', cadence: BillingCadence) {
  const urls = {
    pro: {
      monthly: env.BILLING_CHECKOUT_PRO_MONTHLY_URL,
      annual: env.BILLING_CHECKOUT_PRO_ANNUAL_URL,
    },
    team: {
      monthly: env.BILLING_CHECKOUT_TEAM_MONTHLY_URL,
      annual: env.BILLING_CHECKOUT_TEAM_ANNUAL_URL,
    },
  } as const;

  return urls[planId][cadence] || '';
}

function salesAssistedCheckoutUrl(plan: BillingPlan, cadence: BillingCadence, email?: string | null) {
  const subject = `PaperForge ${plan.name} ${cadence} checkout`;
  const body = [
    `Plan: ${plan.name}`,
    `Cadence: ${cadence}`,
    email ? `Account email: ${email}` : '',
    '',
    'Please send checkout or invoice details for this subscription.',
  ]
    .filter(Boolean)
    .join('\n');

  return `mailto:${env.BILLING_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function buildCheckoutTarget(planId: 'pro' | 'team', cadence: BillingCadence, email?: string | null) {
  const plan = getBillingPlan(planId);
  const hostedCheckoutUrl = configuredCheckoutUrl(planId, cadence);

  if (hostedCheckoutUrl) {
    return {
      plan,
      checkoutUrl: hostedCheckoutUrl,
      provider: env.BILLING_PROVIDER,
      providerConfigured: true,
      mode: 'hosted-checkout' as const,
    };
  }

  return {
    plan,
    checkoutUrl: salesAssistedCheckoutUrl(plan, cadence, email),
    provider: 'manual',
    providerConfigured: false,
    mode: 'sales-assisted' as const,
  };
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return ApiErrors.unauthorized();

    const user = session.user as { id: string; email?: string | null };
    const limited = await enforceRateLimit(
      `rate:billing-checkout:${user.id}`,
      RATE_LIMITS.BILLING_CHECKOUT,
      'Too many checkout attempts. Please try again later.',
    );
    if (limited) return limited;

    const data = checkoutSchema.parse(await request.json());
    const target = buildCheckoutTarget(data.planId, data.cadence, user.email);

    logAuditAction(user.id, 'billing.checkout_started', 'user', user.id, {
      planId: data.planId,
      cadence: data.cadence,
      provider: target.provider,
      providerConfigured: target.providerConfigured,
      mode: target.mode,
    }).catch(() => {});
    // Persisted activation marker (user reviewed plans / started checkout).
    recordActivationEvent(user.id, 'reviewed_billing').catch(() => {});

    return apiSuccess({
      planId: data.planId,
      cadence: data.cadence,
      checkoutUrl: target.checkoutUrl,
      provider: target.provider,
      providerConfigured: target.providerConfigured,
      mode: target.mode,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const planId = request.nextUrl.searchParams.get('planId');
    const cadence = request.nextUrl.searchParams.get('cadence') ?? 'monthly';

    const data = checkoutSchema.parse({ planId, cadence });
    const session = await auth();
    if (!session?.user) {
      return NextResponse.redirect(new URL(`/register?plan=${data.planId}`, request.url));
    }

    const user = session.user as { email?: string | null };
    const target = buildCheckoutTarget(data.planId, data.cadence, user.email);
    if (!target.providerConfigured) {
      return NextResponse.redirect(new URL(`/pricing?contact=sales&plan=${data.planId}`, request.url));
    }

    return NextResponse.redirect(target.checkoutUrl);
  } catch (error) {
    if (error instanceof ApiError) return errorResponse(error);
    return NextResponse.redirect(new URL('/pricing', request.url));
  }
}

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const WEBHOOK_SECRET = 'whsec_route_test_secret';

const mocks = vi.hoisted(() => {
  // Must run before module imports so env.ts picks up the secret.
  process.env.BILLING_WEBHOOK_SECRET = 'whsec_route_test_secret';
  return {
    auditFindFirst: vi.fn(),
    userFindUnique: vi.fn(),
    userUpdate: vi.fn(),
    logAuditAction: vi.fn(),
    enforceRateLimit: vi.fn(),
  };
});

vi.mock('@/lib/prisma', () => ({
  prisma: {
    auditLog: { findFirst: mocks.auditFindFirst },
    user: { findUnique: mocks.userFindUnique, update: mocks.userUpdate },
  },
}));

vi.mock('@/services/audit-service', () => ({
  logAuditAction: mocks.logAuditAction,
}));

vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>();
  return { ...actual, enforceRateLimit: mocks.enforceRateLimit };
});

import { POST } from '@/app/api/v1/billing/webhook/route';
import { signWebhookPayload } from '@/lib/billing-webhook';
import { BILLING_PLANS } from '@/lib/billing-plans';

function makeRequest(rawBody: string, header: string | null) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (header) headers.set('stripe-signature', header);
  return new Request('http://localhost/api/v1/billing/webhook', {
    method: 'POST',
    headers,
    body: rawBody,
  }) as unknown as Parameters<typeof POST>[0];
}

function signedRequest(event: unknown) {
  const raw = JSON.stringify(event);
  const ts = Math.floor(Date.now() / 1000);
  return makeRequest(raw, signWebhookPayload(raw, WEBHOOK_SECRET, ts));
}

const checkoutEvent = {
  id: 'evt_checkout_1',
  type: 'checkout.session.completed',
  data: {
    object: {
      client_reference_id: 'user-1',
      customer_email: 'buyer@example.com',
      metadata: { planId: 'pro' },
    },
  },
};

describe('POST /api/v1/billing/webhook (behavior)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceRateLimit.mockResolvedValue(null);
    mocks.auditFindFirst.mockResolvedValue(null);
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-1',
      settings: { billingPlan: 'free' },
      storageQuotaBytes: BigInt(BILLING_PLANS.free.storageBytes),
    });
    mocks.userUpdate.mockResolvedValue({ id: 'user-1' });
    mocks.logAuditAction.mockResolvedValue(undefined);
  });

  it('activates the paid plan for a correctly signed checkout event', async () => {
    const res = await POST(signedRequest(checkoutEvent));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      data: { received: true, handled: true, plan: 'pro' },
    });
    // Plan write happened with the Pro quota.
    expect(mocks.userUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.userUpdate.mock.calls[0][0].data.settings.billingPlan).toBe('pro');
    // A subscription-activated audit record + an idempotency marker were written.
    const actions = mocks.logAuditAction.mock.calls.map((c) => c[1]);
    expect(actions).toContain('billing.subscription_activated');
    expect(actions).toContain('billing.webhook_processed');
  });

  it('rejects an invalid signature with 400 and does not mutate', async () => {
    const raw = JSON.stringify(checkoutEvent);
    const res = await POST(makeRequest(raw, 't=1700000000,v1=deadbeef'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_SIGNATURE');
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it('rejects a missing signature header with 400', async () => {
    const raw = JSON.stringify(checkoutEvent);
    const res = await POST(makeRequest(raw, null));
    expect(res.status).toBe(400);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it('is idempotent — a duplicate event id is acked without re-applying', async () => {
    mocks.auditFindFirst.mockResolvedValue({ id: 'existing-marker' });
    const res = await POST(signedRequest(checkoutEvent));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ received: true, handled: false, reason: 'duplicate' });
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it('acks unhandled event types without mutating', async () => {
    const res = await POST(signedRequest({ id: 'evt_x', type: 'invoice.paid', data: { object: {} } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.reason).toBe('unhandled_event');
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it('acks but does not mutate when the target user cannot be resolved', async () => {
    mocks.userFindUnique.mockResolvedValue(null);
    const res = await POST(signedRequest(checkoutEvent));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.reason).toBe('user_not_found');
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    // Still recorded in the ledger.
    expect(mocks.logAuditAction.mock.calls.map((c) => c[1])).toContain('billing.webhook_processed');
  });

  it('downgrades to free on a subscription deletion event', async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-1',
      settings: { billingPlan: 'pro' },
      storageQuotaBytes: BigInt(BILLING_PLANS.pro.storageBytes),
    });
    const res = await POST(
      signedRequest({
        id: 'evt_del_1',
        type: 'customer.subscription.deleted',
        data: { object: { metadata: { userId: 'user-1' } } },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.plan).toBe('free');
    expect(mocks.userUpdate.mock.calls[0][0].data.settings.billingPlan).toBe('free');
    expect(mocks.logAuditAction.mock.calls.map((c) => c[1])).toContain('billing.subscription_canceled');
  });

  it('returns 503 when no signing secret is configured', async () => {
    const original = process.env.BILLING_WEBHOOK_SECRET;
    vi.resetModules();
    process.env.BILLING_WEBHOOK_SECRET = '';
    try {
      const fresh = await import('@/app/api/v1/billing/webhook/route');
      const res = await fresh.POST(signedRequest(checkoutEvent));
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error.code).toBe('WEBHOOK_NOT_CONFIGURED');
    } finally {
      process.env.BILLING_WEBHOOK_SECRET = original;
      vi.resetModules();
    }
  });
});

describe('billing webhook wiring (static)', () => {
  const route = readFileSync(
    join(process.cwd(), 'src/app/api/v1/billing/webhook/route.ts'),
    'utf-8',
  );

  it('verifies the signature before parsing the event', () => {
    const verifyIdx = route.indexOf('verifyWebhookSignature');
    const parseIdx = route.indexOf('parseBillingEvent');
    expect(verifyIdx).toBeGreaterThan(-1);
    expect(parseIdx).toBeGreaterThan(verifyIdx);
  });

  it('reads the raw body for signature verification', () => {
    expect(route).toContain('request.text()');
  });

  it('enforces idempotency via the audit-log ledger', () => {
    expect(route).toContain("targetType: 'billing_event'");
  });

  it('is rate-limited per IP', () => {
    expect(route).toContain('BILLING_WEBHOOK');
    expect(route).toContain('getClientIp');
  });

  it('applies the plan through the shared billing service', () => {
    expect(route).toContain('applyBillingPlanToUser');
  });
});

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  parseSignatureHeader,
  signWebhookPayload,
  verifyWebhookSignature,
  parseBillingEvent,
} from '@/lib/billing-webhook';

const SECRET = 'whsec_test_secret_key';

function signedHeader(payload: string, timestamp: number, secret = SECRET) {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

describe('parseSignatureHeader', () => {
  it('extracts timestamp and v1 signatures', () => {
    const parsed = parseSignatureHeader('t=1700000000,v1=abc,v1=def');
    expect(parsed.timestamp).toBe(1700000000);
    expect(parsed.signatures).toEqual(['abc', 'def']);
  });

  it('returns null timestamp and empty signatures for malformed headers', () => {
    const parsed = parseSignatureHeader('garbage');
    expect(parsed.timestamp).toBeNull();
    expect(parsed.signatures).toEqual([]);
  });

  it('ignores non-v1 scheme entries', () => {
    const parsed = parseSignatureHeader('t=1700000000,v0=legacy,v1=keep');
    expect(parsed.signatures).toEqual(['keep']);
  });
});

describe('signWebhookPayload / verifyWebhookSignature', () => {
  const payload = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });
  const now = 1700000300;

  it('accepts a correctly signed payload within tolerance', () => {
    const header = signedHeader(payload, now);
    const result = verifyWebhookSignature({
      payload,
      signatureHeader: header,
      secret: SECRET,
      nowSeconds: now,
    });
    expect(result.valid).toBe(true);
  });

  it('round-trips with signWebhookPayload helper', () => {
    const header = signWebhookPayload(payload, SECRET, now);
    const result = verifyWebhookSignature({
      payload,
      signatureHeader: header,
      secret: SECRET,
      nowSeconds: now,
    });
    expect(result.valid).toBe(true);
  });

  it('rejects a tampered payload', () => {
    const header = signedHeader(payload, now);
    const result = verifyWebhookSignature({
      payload: payload + 'x',
      signatureHeader: header,
      secret: SECRET,
      nowSeconds: now,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('signature_mismatch');
  });

  it('rejects a wrong secret', () => {
    const header = signedHeader(payload, now, 'other_secret');
    const result = verifyWebhookSignature({
      payload,
      signatureHeader: header,
      secret: SECRET,
      nowSeconds: now,
    });
    expect(result.valid).toBe(false);
  });

  it('rejects timestamps outside the replay tolerance window', () => {
    const header = signedHeader(payload, now);
    const result = verifyWebhookSignature({
      payload,
      signatureHeader: header,
      secret: SECRET,
      nowSeconds: now + 1000, // 1000s later, default tolerance 300s
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('timestamp_out_of_tolerance');
  });

  it('rejects a missing signature header', () => {
    const result = verifyWebhookSignature({
      payload,
      signatureHeader: null,
      secret: SECRET,
      nowSeconds: now,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('missing_signature');
  });

  it('rejects when no secret is configured', () => {
    const header = signedHeader(payload, now);
    const result = verifyWebhookSignature({
      payload,
      signatureHeader: header,
      secret: '',
      nowSeconds: now,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('no_secret');
  });
});

describe('parseBillingEvent', () => {
  it('maps checkout.session.completed to an activation with plan + user', () => {
    const event = {
      id: 'evt_abc',
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: 'user-123',
          customer_email: 'buyer@example.com',
          metadata: { planId: 'pro' },
        },
      },
    };
    const parsed = parseBillingEvent(event);
    expect(parsed).toEqual({
      id: 'evt_abc',
      kind: 'activate',
      planId: 'pro',
      userId: 'user-123',
      email: 'buyer@example.com',
    });
  });

  it('maps customer.subscription.deleted to a cancellation (downgrade)', () => {
    const event = {
      id: 'evt_del',
      type: 'customer.subscription.deleted',
      data: { object: { metadata: { userId: 'user-9' } } },
    };
    const parsed = parseBillingEvent(event);
    expect(parsed?.kind).toBe('cancel');
    expect(parsed?.userId).toBe('user-9');
  });

  it('maps customer.subscription.updated to an activation for the new plan', () => {
    const event = {
      id: 'evt_upd',
      type: 'customer.subscription.updated',
      data: { object: { metadata: { userId: 'user-9', planId: 'team' } } },
    };
    const parsed = parseBillingEvent(event);
    expect(parsed?.kind).toBe('activate');
    expect(parsed?.planId).toBe('team');
  });

  it('returns null for unhandled event types', () => {
    expect(parseBillingEvent({ id: 'evt_x', type: 'invoice.paid', data: { object: {} } })).toBeNull();
  });

  it('returns null when an activation references an unknown plan id', () => {
    const event = {
      id: 'evt_bad',
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: 'u1', metadata: { planId: 'enterprise' } } },
    };
    expect(parseBillingEvent(event)).toBeNull();
  });

  it('returns null for a non-object event', () => {
    expect(parseBillingEvent(null)).toBeNull();
    expect(parseBillingEvent('nope')).toBeNull();
  });
});

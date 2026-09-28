/**
 * Payment-provider webhook verification and event parsing.
 *
 * Provider-agnostic but Stripe-shaped: signatures use the Stripe convention of
 * a `t=<unix-ts>,v1=<hex-hmac>` header where the signed payload is
 * `${timestamp}.${rawBody}` HMAC-SHA256'd with the endpoint signing secret.
 * This keeps the implementation testable without a live provider while matching
 * the format real providers (Stripe, and Stripe-compatible gateways) send.
 *
 * The webhook is the automated counterpart to the admin "sales-assisted"
 * provisioning path: both ultimately write `settings.billingPlan`, which the
 * entitlement layer reads. See src/services/billing-service.ts.
 */
import crypto from 'crypto';
import { isPlanId, type PlanId } from '@/lib/billing-plans';

const DEFAULT_TOLERANCE_SECONDS = 300; // 5 minutes — matches Stripe's default

export interface ParsedSignatureHeader {
  timestamp: number | null;
  signatures: string[];
}

/** Parse a `t=...,v1=...,v1=...` signature header into its parts. */
export function parseSignatureHeader(header: string): ParsedSignatureHeader {
  const result: ParsedSignatureHeader = { timestamp: null, signatures: [] };
  for (const part of header.split(',')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === 't') {
      const ts = Number.parseInt(value, 10);
      if (Number.isInteger(ts)) result.timestamp = ts;
    } else if (key === 'v1' && value) {
      result.signatures.push(value);
    }
  }
  return result;
}

/** Produce a signature header for a payload — used by tests and tooling. */
export function signWebhookPayload(payload: string, secret: string, timestampSeconds: number): string {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestampSeconds}.${payload}`)
    .digest('hex');
  return `t=${timestampSeconds},v1=${signature}`;
}

export interface WebhookVerifyOptions {
  payload: string;
  signatureHeader: string | null;
  secret: string;
  toleranceSeconds?: number;
  /** Injectable clock (seconds) for deterministic tests. */
  nowSeconds?: number;
}

export type WebhookVerifyResult =
  | { valid: true }
  | { valid: false; reason: WebhookVerifyFailure };

export type WebhookVerifyFailure =
  | 'no_secret'
  | 'missing_signature'
  | 'malformed_signature'
  | 'timestamp_out_of_tolerance'
  | 'signature_mismatch';

/** Constant-time comparison of two hex strings of equal length. */
function timingSafeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

export function verifyWebhookSignature(opts: WebhookVerifyOptions): WebhookVerifyResult {
  const { payload, signatureHeader, secret } = opts;
  if (!secret) return { valid: false, reason: 'no_secret' };
  if (!signatureHeader) return { valid: false, reason: 'missing_signature' };

  const { timestamp, signatures } = parseSignatureHeader(signatureHeader);
  if (timestamp === null || signatures.length === 0) {
    return { valid: false, reason: 'malformed_signature' };
  }

  const tolerance = opts.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > tolerance) {
    return { valid: false, reason: 'timestamp_out_of_tolerance' };
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');

  // A provider may include multiple signatures (e.g. during secret rotation);
  // accept if any matches.
  const matched = signatures.some((candidate) => timingSafeHexEqual(candidate, expected));
  return matched ? { valid: true } : { valid: false, reason: 'signature_mismatch' };
}

export type BillingEventKind = 'activate' | 'cancel';

export interface ParsedBillingEvent {
  id: string;
  kind: BillingEventKind;
  /** Target plan for activations; 'free' for cancellations. */
  planId: PlanId;
  userId?: string;
  email?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Normalize a provider event into a plan transition, or null if the event is
 * not one we act on (unhandled type, unknown plan, non-object payload).
 */
export function parseBillingEvent(event: unknown): ParsedBillingEvent | null {
  const root = asRecord(event);
  const id = asString(root.id);
  const type = asString(root.type);
  if (!id || !type) return null;

  const object = asRecord(asRecord(root.data).object);
  const metadata = asRecord(object.metadata);
  const userId = asString(object.client_reference_id) ?? asString(metadata.userId);
  const email = asString(object.customer_email) ?? asString(metadata.email);

  if (type === 'customer.subscription.deleted') {
    return { id, kind: 'cancel', planId: 'free', userId, email };
  }

  if (type === 'checkout.session.completed' || type === 'customer.subscription.updated') {
    const planId = metadata.planId;
    if (!isPlanId(planId)) return null;
    return { id, kind: 'activate', planId, userId, email };
  }

  return null;
}

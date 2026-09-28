/**
 * Billing plan application — the single canonical way to move a user between
 * plans. Both the automated payment webhook and (conceptually) the admin
 * sales-assisted path converge here: writing `settings.billingPlan` plus a
 * matching `storageQuotaBytes` so the entitlement layer and the storage-based
 * plan fallback agree. See src/lib/billing-plans.ts and the webhook route.
 */
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import {
  type PlanId,
  BILLING_PLANS,
  resolveBillingPlanForUser,
} from '@/lib/billing-plans';

export interface PlanTransition {
  from: PlanId;
  to: PlanId;
}

function settingsRecord(settings: unknown): Record<string, unknown> {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return {};
  return settings as Record<string, unknown>;
}

/**
 * Apply a billing plan to a user. Merges into the existing settings JSON blob
 * (which also holds editor prefs) rather than overwriting it, and aligns the
 * storage quota with the plan. Returns the from→to transition for auditing.
 */
export async function applyBillingPlanToUser(
  userId: string,
  planId: PlanId,
): Promise<PlanTransition> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { settings: true, storageQuotaBytes: true },
  });
  if (!user) throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');

  const targetPlan = BILLING_PLANS[planId];
  const currentPlan = resolveBillingPlanForUser({
    settings: user.settings,
    storageQuotaBytes: user.storageQuotaBytes,
  });
  const currentSettings = settingsRecord(user.settings);

  await prisma.user.update({
    where: { id: userId },
    data: {
      settings: { ...currentSettings, billingPlan: targetPlan.id },
      storageQuotaBytes: BigInt(targetPlan.storageBytes),
    },
  });

  return { from: currentPlan.id, to: targetPlan.id };
}

/**
 * Resolve the user a billing event targets. Prefers an explicit user id
 * (carried via checkout client_reference_id / subscription metadata) and falls
 * back to the account email. Returns null when neither resolves so the caller
 * can ack the webhook without throwing (provider retries are pointless if the
 * account genuinely does not exist).
 */
export async function resolveBillingUser(input: {
  userId?: string;
  email?: string;
}): Promise<{ id: string } | null> {
  if (input.userId) {
    const byId = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true },
    });
    if (byId) return byId;
  }
  if (input.email) {
    const byEmail = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (byEmail) return byEmail;
  }
  return null;
}

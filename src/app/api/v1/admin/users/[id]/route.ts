import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { errorResponse, ApiError } from '@/lib/errors';
import { ApiErrors, apiSuccess } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { logAuditAction } from '@/services/audit-service';
import { enforceRateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';
import {
  type PlanId,
  PLAN_IDS,
  BILLING_PLANS,
  resolveBillingPlanForUser,
} from '@/lib/billing-plans';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const patchUserSchema = z
  .object({
    role: z.enum(['user', 'admin']).optional(),
    suspend: z.boolean().optional(),
    // Sales-assisted provisioning: an admin grants a billing plan after a
    // Contact Sales / checkout conversation. This is the only path that actually
    // writes settings.billingPlan, which the entitlement layer reads.
    plan: z.enum([...PLAN_IDS] as [PlanId, ...PlanId[]]).optional(),
  })
  .refine(
    (data) =>
      data.role !== undefined || data.suspend !== undefined || data.plan !== undefined,
    {
      message: 'At least one user field must be provided',
    },
  );

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    const adminRole = (session?.user as { role?: string } | undefined)?.role;
    if (!session?.user || adminRole !== 'admin') {
      return ApiErrors.forbidden();
    }
    const adminId = (session.user as { id: string }).id;
    const { id } = await params;

    const limited = await enforceRateLimit(`rate:admin-mutate:${adminId}`, RATE_LIMITS.ADMIN_MUTATE);
    if (limited) return limited;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new ApiError(404, 'User not found');

    const body = await request.json();
    const data = patchUserSchema.parse(body);

    const updateData: Record<string, unknown> = {};
    const auditDetails: Record<string, unknown> = {};

    if (data.role !== undefined) {
      updateData.role = data.role;
      // Bump tokenVersion so the target user's JWT is invalidated within the
      // next 5-minute check window, forcing re-login with the new role.
      updateData.tokenVersion = { increment: 1 };
      auditDetails.role = { from: user.role, to: data.role };
    }

    if (data.suspend !== undefined) {
      if (data.suspend) {
        updateData.lockedUntil = new Date('2099-01-01T00:00:00Z');
        // Invalidate active sessions so the suspension takes effect within 5 min.
        updateData.tokenVersion = { increment: 1 };
        auditDetails.action = 'suspend';
      } else {
        updateData.lockedUntil = null;
        updateData.failedLoginAttempts = 0;
        auditDetails.action = 'unsuspend';
      }
    }

    if (data.plan !== undefined) {
      const targetPlan = BILLING_PLANS[data.plan];
      const currentPlan = resolveBillingPlanForUser({
        settings: user.settings,
        storageQuotaBytes: user.storageQuotaBytes,
      });
      // Merge into existing settings rather than overwriting — settings is a
      // shared JSON blob (editor prefs, etc.). Only the billingPlan key changes.
      const currentSettings =
        user.settings && typeof user.settings === 'object' && !Array.isArray(user.settings)
          ? (user.settings as Record<string, unknown>)
          : {};
      updateData.settings = { ...currentSettings, billingPlan: targetPlan.id };
      // Keep the storage quota consistent with the plan so quota enforcement and
      // the storage-based plan fallback agree with the explicit assignment.
      updateData.storageQuotaBytes = BigInt(targetPlan.storageBytes);
      auditDetails.plan = { from: currentPlan.id, to: targetPlan.id };
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        lockedUntil: true,
      },
    });

    await logAuditAction(adminId, 'update_user', 'user', id, auditDetails);

    return apiSuccess(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

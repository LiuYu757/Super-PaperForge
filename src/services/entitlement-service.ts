import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { type ExportFormat } from '@/lib/billing-plans';
import { canExportFormat, exportUpgradeMessage, getEntitledPlan } from '@/lib/entitlements';
import { getProjectOwnerId } from '@/lib/storage';

/**
 * Export capability is a project-scoped entitlement: it follows the project
 * OWNER's plan (like storage and collaborator limits), not the requester's, so
 * a Free collaborator on a paid project can still export, and a paid user
 * collaborating on a Free project cannot bypass the owner's tier.
 *
 * PDF is allowed on every plan; DOCX/ZIP/SyncTeX are paid-only, matching the
 * pricing page.
 */
export async function assertExportEntitlement(projectId: string, format: ExportFormat) {
  const ownerId = await getProjectOwnerId(projectId);
  // No resolvable owner — leave it to the route's own role/existence guards.
  if (!ownerId) return;

  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { settings: true, storageQuotaBytes: true },
  });
  const plan = getEntitledPlan(owner ?? {});

  if (!canExportFormat(plan, format)) {
    throw new ApiError(402, exportUpgradeMessage(plan, format), 'PLAN_EXPORT_NOT_ALLOWED');
  }
}

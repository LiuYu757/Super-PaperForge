import {
  type BillingPlan,
  type ExportFormat,
  getNextUpgradePlan,
  resolveBillingPlanForUser,
} from '@/lib/billing-plans';

export interface EntitlementUser {
  settings?: unknown;
  storageQuotaBytes?: number | string | bigint | null;
}

export function getEntitledPlan(user: EntitlementUser): BillingPlan {
  return resolveBillingPlanForUser(user);
}

export function canAddProjectCollaborator(plan: BillingPlan, currentMemberCount: number) {
  if (plan.collaboratorLimit === null) return true;

  const existingCollaborators = Math.max(0, currentMemberCount - 1);
  return existingCollaborators < plan.collaboratorLimit;
}

export function collaboratorLimitMessage(plan: BillingPlan) {
  if (plan.collaboratorLimit === null) return null;

  const upgrade = getNextUpgradePlan(plan.id);
  const suffix = upgrade
    ? ` Upgrade to ${upgrade.name} for more collaborators.`
    : ' Contact sales to raise this limit.';

  return `${plan.name} includes ${plan.collaboratorLimit} collaborators per project.${suffix}`;
}

export function canExportFormat(plan: BillingPlan, format: ExportFormat) {
  return plan.exportFormats.includes(format);
}

export function exportUpgradeMessage(plan: BillingPlan, format: ExportFormat) {
  const upgrade = getNextUpgradePlan(plan.id);
  return `${format.toUpperCase()} export is available on paid plans.${
    upgrade ? ` Upgrade to ${upgrade.name} to enable it.` : ''
  }`;
}

export function aiHourlyRateLimit(plan: BillingPlan): { limit: number; windowSeconds: number } {
  return { limit: plan.aiRequestsPerHour, windowSeconds: 3600 };
}

export function compilationQueuePriority(plan: BillingPlan) {
  switch (plan.compilePriority) {
    case 'enterprise':
      return 1;
    case 'priority':
      return 2;
    default:
      return 5;
  }
}

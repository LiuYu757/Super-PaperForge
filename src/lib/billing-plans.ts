export const PLAN_IDS = ['free', 'pro', 'team'] as const;

export type PlanId = (typeof PLAN_IDS)[number];
export type BillingCadence = 'monthly' | 'annual';
export type ExportFormat = 'pdf' | 'docx' | 'zip' | 'synctex';

export interface BillingPlan {
  id: PlanId;
  name: string;
  audience: string;
  description: string;
  monthlyPriceCents: number;
  annualPriceCents: number;
  priceUnit: string;
  storageBytes: number;
  projectLimit: number | null;
  collaboratorLimit: number | null;
  exportFormats: readonly ExportFormat[];
  aiRequestsPerHour: number;
  compilePriority: 'standard' | 'priority' | 'enterprise';
  support: string;
  cta: string;
  recommended: boolean;
  features: readonly string[];
}

const GIB = 1024 * 1024 * 1024;

export const BILLING_PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    audience: 'Individual drafts',
    description: 'For students and researchers validating PaperForge on real work.',
    monthlyPriceCents: 0,
    annualPriceCents: 0,
    priceUnit: 'forever',
    storageBytes: 2 * GIB,
    projectLimit: 3,
    collaboratorLimit: 2,
    exportFormats: ['pdf'],
    aiRequestsPerHour: 20,
    compilePriority: 'standard',
    support: 'Community support',
    cta: 'Get Started',
    recommended: false,
    features: [
      '2 GB storage',
      '3 active owned projects',
      '2 collaborators per project',
      'PDF preview and export',
      'LaTeX autocomplete and linting',
      'Community support',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    audience: 'Publishing researchers',
    description: 'For authors who need serious throughput, exports, and version control.',
    monthlyPriceCents: 800,
    annualPriceCents: 8000,
    priceUnit: '/month',
    storageBytes: 20 * GIB,
    projectLimit: null,
    collaboratorLimit: 10,
    exportFormats: ['pdf', 'docx', 'zip', 'synctex'],
    aiRequestsPerHour: 100,
    compilePriority: 'priority',
    support: 'Email support',
    cta: 'Start Pro Trial',
    recommended: true,
    features: [
      '20 GB storage',
      'Unlimited projects',
      '10 collaborators per project',
      'PDF, DOCX, ZIP, and SyncTeX export',
      'Git push and pull',
      'Priority compilation',
      'Email support',
    ],
  },
  team: {
    id: 'team',
    name: 'Team',
    audience: 'Labs and departments',
    description: 'For research groups that need governance, templates, and support coverage.',
    monthlyPriceCents: 1500,
    annualPriceCents: 15000,
    priceUnit: '/user/month',
    storageBytes: 250 * GIB,
    projectLimit: null,
    collaboratorLimit: null,
    exportFormats: ['pdf', 'docx', 'zip', 'synctex'],
    aiRequestsPerHour: 300,
    compilePriority: 'enterprise',
    support: 'Priority support with SLA',
    cta: 'Contact Sales',
    recommended: false,
    features: [
      '250 GB shared storage',
      'Unlimited projects and users',
      'Unlimited collaborators',
      'Git integration and SSO readiness',
      'Admin dashboard and audit log',
      'Custom templates',
      'Priority support with SLA',
    ],
  },
} as const satisfies Record<PlanId, BillingPlan>;

export const BILLING_PLAN_LIST = PLAN_IDS.map((id) => BILLING_PLANS[id]);

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && PLAN_IDS.includes(value as PlanId);
}

export function getBillingPlan(planId: PlanId): BillingPlan {
  return BILLING_PLANS[planId];
}

export function formatPlanPrice(plan: BillingPlan, cadence: BillingCadence = 'monthly') {
  const cents = cadence === 'annual' ? plan.annualPriceCents : plan.monthlyPriceCents;
  if (cents === 0) return '$0';
  const amount = cents / 100;
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

export function formatBytesForPlan(bytes: number) {
  const gib = bytes / GIB;
  return Number.isInteger(gib) ? `${gib} GB` : `${gib.toFixed(1)} GB`;
}

function settingsRecord(settings: unknown): Record<string, unknown> {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return {};
  return settings as Record<string, unknown>;
}

function coerceBytes(value: number | string | bigint | null | undefined) {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number.parseFloat(value);
  return 0;
}

export function resolveBillingPlanForUser(user: {
  settings?: unknown;
  storageQuotaBytes?: number | string | bigint | null;
}): BillingPlan {
  const explicitPlan = settingsRecord(user.settings).billingPlan;
  if (isPlanId(explicitPlan)) return getBillingPlan(explicitPlan);

  const quota = coerceBytes(user.storageQuotaBytes);
  if (quota >= BILLING_PLANS.team.storageBytes) return BILLING_PLANS.team;
  if (quota >= BILLING_PLANS.pro.storageBytes) return BILLING_PLANS.pro;
  return BILLING_PLANS.free;
}

export function getNextUpgradePlan(planId: PlanId): BillingPlan | null {
  if (planId === 'free') return BILLING_PLANS.pro;
  if (planId === 'pro') return BILLING_PLANS.team;
  return null;
}

export function canCreateProjectForPlan(plan: BillingPlan, ownedProjectCount: number) {
  return plan.projectLimit === null || ownedProjectCount < plan.projectLimit;
}

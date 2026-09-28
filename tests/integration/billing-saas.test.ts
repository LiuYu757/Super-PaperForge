import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

describe('SaaS billing implementation', () => {
  it('exposes billing plan and checkout API routes', () => {
    expect(existsSync(join(process.cwd(), 'src/app/api/v1/billing/plans/route.ts'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/app/api/v1/billing/checkout/route.ts'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/app/api/v1/billing/sales-inquiry/route.ts'))).toBe(true);
  });

  it('pricing page uses the centralized billing catalog and checkout button', () => {
    const pricing = readFileSync(join(process.cwd(), 'src/app/pricing/page.tsx'), 'utf-8');
    expect(pricing).toContain('BILLING_PLAN_LIST');
    expect(pricing).toContain('CheckoutButton');
    expect(pricing).toContain('formatPlanPrice');
  });

  it('pricing page answers Team buyer objections and routes to a sales inquiry', () => {
    const pricing = readFileSync(join(process.cwd(), 'src/app/pricing/page.tsx'), 'utf-8');
    expect(pricing).toContain('TEAM_FAQ');
    expect(pricing).toContain('Buying for a lab or department?');
    expect(pricing).toContain('Start a Team inquiry');
    expect(pricing).toContain('/billing');
  });

  it('dashboard exposes an authenticated billing page', () => {
    const billingPage = readFileSync(join(process.cwd(), 'src/app/(dashboard)/billing/page.tsx'), 'utf-8');
    const navbar = readFileSync(join(process.cwd(), 'src/components/shared/navbar.tsx'), 'utf-8');
    expect(billingPage).toContain('Plan and Billing');
    expect(billingPage).toContain('resolveBillingPlanForUser');
    expect(billingPage).toContain('SalesInquiryForm');
    expect(navbar).toContain('/billing');
  });

  it('checkout route supports hosted checkout and manual sales fallback', () => {
    const checkout = readFileSync(join(process.cwd(), 'src/app/api/v1/billing/checkout/route.ts'), 'utf-8');
    expect(checkout).toContain('BILLING_CHECKOUT');
    expect(checkout).toContain('hosted-checkout');
    expect(checkout).toContain('sales-assisted');
    expect(checkout).toContain('BILLING_CHECKOUT_PRO_MONTHLY_URL');
  });

  it('project creation is guarded by plan limits', () => {
    const projectService = readFileSync(join(process.cwd(), 'src/services/project-service.ts'), 'utf-8');
    expect(projectService).toContain('assertProjectCreationAllowed');
    expect(projectService).toContain('resolveBillingPlanForUser');
    expect(projectService).toContain('PLAN_LIMIT_REACHED');
  });

  it('collaboration growth is guarded by plan entitlements', () => {
    const entitlements = readFileSync(join(process.cwd(), 'src/lib/entitlements.ts'), 'utf-8');
    const memberService = readFileSync(join(process.cwd(), 'src/services/member-service.ts'), 'utf-8');
    expect(entitlements).toContain('canAddProjectCollaborator');
    expect(memberService).toContain('PLAN_COLLABORATOR_LIMIT_REACHED');
  });

  it('compilation queue priority is plan-aware', () => {
    const entitlements = readFileSync(join(process.cwd(), 'src/lib/entitlements.ts'), 'utf-8');
    const compilationService = readFileSync(join(process.cwd(), 'src/services/compilation-service.ts'), 'utf-8');
    expect(entitlements).toContain('compilationQueuePriority');
    expect(compilationService).toContain('getEntitledPlan');
    expect(compilationService).toContain('priority');
  });

  it('dashboard exposes activation checklist for first-run users', () => {
    const projectsPage = readFileSync(join(process.cwd(), 'src/app/(dashboard)/projects/page.tsx'), 'utf-8');
    const checklist = readFileSync(join(process.cwd(), 'src/components/dashboard/activation-checklist.tsx'), 'utf-8');
    expect(projectsPage).toContain('ActivationChecklist');
    expect(checklist).toContain('Launch Checklist');
    expect(checklist).toContain('getActivationChecklist');
  });

  it('sales inquiry route is rate-limited, audited, and sends email', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/v1/billing/sales-inquiry/route.ts'), 'utf-8');
    const form = readFileSync(join(process.cwd(), 'src/components/billing/sales-inquiry-form.tsx'), 'utf-8');
    const templates = readFileSync(join(process.cwd(), 'src/lib/email-templates.ts'), 'utf-8');
    expect(route).toContain('BILLING_SALES_INQUIRY');
    expect(route).toContain('sendEmail');
    expect(route).toContain('billing.sales_inquiry');
    expect(form).toContain('/api/v1/billing/sales-inquiry');
    expect(templates).toContain('salesInquiryEmailTemplate');
  });

  it('AI assist applies a plan-aware per-user rate limit', () => {
    const entitlements = readFileSync(join(process.cwd(), 'src/lib/entitlements.ts'), 'utf-8');
    const aiRoute = readFileSync(join(process.cwd(), 'src/app/api/v1/ai/assist/route.ts'), 'utf-8');
    expect(entitlements).toContain('aiHourlyRateLimit');
    expect(aiRoute).toContain('aiHourlyRateLimit');
    expect(aiRoute).toContain('getEntitledPlan');
  });

  it('rich export routes are gated by the project owner plan', () => {
    const service = readFileSync(join(process.cwd(), 'src/services/entitlement-service.ts'), 'utf-8');
    const docx = readFileSync(join(process.cwd(), 'src/app/api/v1/projects/[id]/compile/[compileId]/docx/route.ts'), 'utf-8');
    const synctex = readFileSync(join(process.cwd(), 'src/app/api/v1/projects/[id]/compile/[compileId]/synctex/route.ts'), 'utf-8');
    const zip = readFileSync(join(process.cwd(), 'src/app/api/v1/projects/[id]/export/route.ts'), 'utf-8');
    expect(service).toContain('PLAN_EXPORT_NOT_ALLOWED');
    expect(docx).toContain("assertExportEntitlement(id, 'docx')");
    expect(synctex).toContain("assertExportEntitlement(id, 'synctex')");
    expect(zip).toContain("assertExportEntitlement(id, 'zip')");
  });

  it('file writes are guarded by storage-quota entitlements', () => {
    const storage = readFileSync(join(process.cwd(), 'src/lib/storage.ts'), 'utf-8');
    const fileService = readFileSync(join(process.cwd(), 'src/services/file-service.ts'), 'utf-8');
    // Quota is enforced at the service layer so every entry point (save, upload)
    // is covered, and usage is written through to the cache the UI reads.
    expect(storage).toContain('STORAGE_QUOTA_EXCEEDED');
    expect(storage).toContain('syncUserStorageUsed');
    const mutationService = readFileSync(join(process.cwd(), 'src/services/document-mutation-service.ts'), 'utf-8');
    expect(fileService).toContain('applyDocumentMutations');
    expect(mutationService).toContain('enforceAndSyncQuota');
  });

  it('exposes an admin storage-recalc backfill route', () => {
    expect(existsSync(join(process.cwd(), 'src/app/api/v1/admin/storage/recalc/route.ts'))).toBe(true);
    const storage = readFileSync(join(process.cwd(), 'src/lib/storage.ts'), 'utf-8');
    const route = readFileSync(join(process.cwd(), 'src/app/api/v1/admin/storage/recalc/route.ts'), 'utf-8');
    expect(storage).toContain('recalculateAllUsersStorage');
    expect(route).toContain('storage.recalculate');
  });

  it('admins can provision a billing plan, closing the entitlement loop', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/v1/admin/users/[id]/route.ts'), 'utf-8');
    const listRoute = readFileSync(join(process.cwd(), 'src/app/api/v1/admin/users/route.ts'), 'utf-8');
    const adminUi = readFileSync(join(process.cwd(), 'src/app/admin/users/page.tsx'), 'utf-8');
    // The PATCH route is the only path that writes settings.billingPlan, which
    // every entitlement check reads. Without it the SaaS plans are unreachable.
    expect(route).toContain('billingPlan');
    expect(route).toContain('storageQuotaBytes');
    expect(route).toContain('auditDetails.plan');
    // List route surfaces the resolved plan without leaking the raw settings blob.
    expect(listRoute).toContain('resolveBillingPlanForUser');
    expect(listRoute).toContain('usersWithPlan');
    // Admin UI exposes the plan selector.
    expect(adminUi).toContain('setPlan');
  });
});

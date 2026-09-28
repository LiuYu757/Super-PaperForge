import { describe, expect, it } from 'vitest';
import {
  BILLING_PLAN_LIST,
  BILLING_PLANS,
  canCreateProjectForPlan,
  formatPlanPrice,
  getNextUpgradePlan,
  resolveBillingPlanForUser,
} from '@/lib/billing-plans';

describe('billing plan catalog', () => {
  it('defines the three commercial plans in order', () => {
    expect(BILLING_PLAN_LIST.map((plan) => plan.id)).toEqual(['free', 'pro', 'team']);
  });

  it('keeps Free aligned with the default storage quota', () => {
    expect(BILLING_PLANS.free.storageBytes).toBe(2 * 1024 * 1024 * 1024);
    expect(BILLING_PLANS.free.projectLimit).toBe(3);
  });

  it('formats monthly prices for pricing surfaces', () => {
    expect(formatPlanPrice(BILLING_PLANS.free)).toBe('$0');
    expect(formatPlanPrice(BILLING_PLANS.pro)).toBe('$8');
    expect(formatPlanPrice(BILLING_PLANS.team)).toBe('$15');
  });

  it('resolves explicit and quota-derived user plans', () => {
    expect(resolveBillingPlanForUser({ settings: { billingPlan: 'pro' } }).id).toBe('pro');
    expect(resolveBillingPlanForUser({ storageQuotaBytes: BILLING_PLANS.team.storageBytes }).id).toBe('team');
    expect(resolveBillingPlanForUser({ storageQuotaBytes: BILLING_PLANS.pro.storageBytes }).id).toBe('pro');
    expect(resolveBillingPlanForUser({ storageQuotaBytes: BILLING_PLANS.free.storageBytes }).id).toBe('free');
  });

  it('enforces Free project creation limits while paid plans remain unlimited', () => {
    expect(canCreateProjectForPlan(BILLING_PLANS.free, 2)).toBe(true);
    expect(canCreateProjectForPlan(BILLING_PLANS.free, 3)).toBe(false);
    expect(canCreateProjectForPlan(BILLING_PLANS.pro, 1000)).toBe(true);
  });

  it('returns the next upgrade step', () => {
    expect(getNextUpgradePlan('free')?.id).toBe('pro');
    expect(getNextUpgradePlan('pro')?.id).toBe('team');
    expect(getNextUpgradePlan('team')).toBeNull();
  });
});

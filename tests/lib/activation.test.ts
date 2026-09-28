import { describe, expect, it } from 'vitest';
import { getActivationChecklist } from '@/lib/activation';
import { BILLING_PLANS } from '@/lib/billing-plans';

describe('activation checklist', () => {
  it('starts empty for a new free user', () => {
    const checklist = getActivationChecklist({
      projects: [],
      storageQuotaBytes: BILLING_PLANS.free.storageBytes,
    });

    expect(checklist.percent).toBe(0);
    expect(checklist.steps.map((step) => step.done)).toEqual([false, false, false, false]);
  });

  it('marks project, content, collaboration, and billing milestones', () => {
    const checklist = getActivationChecklist({
      projects: [
        {
          id: 'p1',
          name: 'Paper',
          _count: { files: 3 },
          members: [{ userId: 'u1', role: 'owner' }, { userId: 'u2', role: 'editor' }],
        },
      ],
      storageQuotaBytes: BILLING_PLANS.pro.storageBytes,
    });

    expect(checklist.completedCount).toBe(4);
    expect(checklist.percent).toBe(100);
  });
});

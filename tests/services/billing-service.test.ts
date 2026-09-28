import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
      update: mocks.userUpdate,
    },
  },
}));

import { applyBillingPlanToUser, resolveBillingUser } from '@/services/billing-service';
import { BILLING_PLANS } from '@/lib/billing-plans';
import { ApiError } from '@/lib/errors';

describe('applyBillingPlanToUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-1',
      settings: { theme: 'dark', billingPlan: 'free' },
      storageQuotaBytes: BigInt(BILLING_PLANS.free.storageBytes),
    });
    mocks.userUpdate.mockResolvedValue({ id: 'user-1' });
  });

  it('writes settings.billingPlan and the matching storage quota, preserving other settings', async () => {
    const transition = await applyBillingPlanToUser('user-1', 'pro');

    expect(transition).toEqual({ from: 'free', to: 'pro' });
    expect(mocks.userUpdate).toHaveBeenCalledTimes(1);
    const arg = mocks.userUpdate.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'user-1' });
    // Existing settings keys are preserved; only billingPlan changes.
    expect(arg.data.settings).toEqual({ theme: 'dark', billingPlan: 'pro' });
    // Quota is kept consistent with the plan so the storage-based fallback agrees.
    expect(arg.data.storageQuotaBytes).toBe(BigInt(BILLING_PLANS.pro.storageBytes));
  });

  it('downgrades to free on cancellation, resetting the quota', async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-1',
      settings: { billingPlan: 'pro' },
      storageQuotaBytes: BigInt(BILLING_PLANS.pro.storageBytes),
    });

    const transition = await applyBillingPlanToUser('user-1', 'free');

    expect(transition).toEqual({ from: 'pro', to: 'free' });
    const arg = mocks.userUpdate.mock.calls[0][0];
    expect(arg.data.settings).toEqual({ billingPlan: 'free' });
    expect(arg.data.storageQuotaBytes).toBe(BigInt(BILLING_PLANS.free.storageBytes));
  });

  it('treats a null/garbage settings blob as empty', async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-1',
      settings: null,
      storageQuotaBytes: null,
    });

    await applyBillingPlanToUser('user-1', 'team');
    const arg = mocks.userUpdate.mock.calls[0][0];
    expect(arg.data.settings).toEqual({ billingPlan: 'team' });
  });

  it('throws 404 when the user does not exist', async () => {
    mocks.userFindUnique.mockResolvedValue(null);
    await expect(applyBillingPlanToUser('ghost', 'pro')).rejects.toBeInstanceOf(ApiError);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });
});

describe('resolveBillingUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves by userId first', async () => {
    mocks.userFindUnique.mockResolvedValue({ id: 'user-1' });
    const user = await resolveBillingUser({ userId: 'user-1', email: 'x@y.z' });
    expect(user).toEqual({ id: 'user-1' });
    expect(mocks.userFindUnique).toHaveBeenCalledWith({ where: { id: 'user-1' }, select: { id: true } });
  });

  it('falls back to email when userId is missing or not found', async () => {
    mocks.userFindUnique
      .mockResolvedValueOnce(null) // id lookup misses
      .mockResolvedValueOnce({ id: 'user-2' }); // email lookup hits
    const user = await resolveBillingUser({ userId: 'gone', email: 'buyer@example.com' });
    expect(user).toEqual({ id: 'user-2' });
    expect(mocks.userFindUnique).toHaveBeenLastCalledWith({
      where: { email: 'buyer@example.com' },
      select: { id: true },
    });
  });

  it('returns null when neither identifier resolves', async () => {
    mocks.userFindUnique.mockResolvedValue(null);
    const user = await resolveBillingUser({ email: 'nobody@example.com' });
    expect(user).toBeNull();
  });

  it('returns null when no identifiers are provided', async () => {
    const user = await resolveBillingUser({});
    expect(user).toBeNull();
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
  });
});

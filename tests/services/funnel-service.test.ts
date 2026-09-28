import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  userCount: vi.fn(),
  auditCount: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { count: mocks.userCount },
    auditLog: { count: mocks.auditCount },
  },
}));

import { getFunnelReport } from '@/services/funnel-service';

describe('getFunnelReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // registered, verified, createdProject (in call order)
    mocks.userCount
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(80)
      .mockResolvedValueOnce(50);
    // activated, canceled (in call order)
    mocks.auditCount.mockResolvedValueOnce(10).mockResolvedValueOnce(2);
  });

  it('assembles the funnel from cheap indexable counts', async () => {
    const now = new Date('2026-06-25T00:00:00.000Z');
    const report = await getFunnelReport(now);

    expect(report.registered).toBe(100);
    expect(report.stages.find((s) => s.id === 'verified')?.count).toBe(80);
    expect(report.stages.find((s) => s.id === 'created_project')?.count).toBe(50);
    expect(report.conversion).toEqual({ activated: 10, canceled: 2, net: 8, rate: 10 });
    expect(report.generatedAt).toBe(now.toISOString());
  });

  it('counts verified users by the emailVerified column and owners via the relation', async () => {
    await getFunnelReport(new Date('2026-06-25T00:00:00.000Z'));

    const wheres = mocks.userCount.mock.calls.map((c) => c[0]);
    // first call: total users (no where)
    expect(wheres[0]).toBeUndefined();
    expect(wheres[1]).toEqual({ where: { emailVerified: true } });
    expect(wheres[2]).toEqual({ where: { projectMembers: { some: { role: 'owner' } } } });

    const auditWheres = mocks.auditCount.mock.calls.map((c) => c[0]);
    expect(auditWheres[0]).toEqual({ where: { action: 'billing.subscription_activated' } });
    expect(auditWheres[1]).toEqual({ where: { action: 'billing.subscription_canceled' } });
  });
});

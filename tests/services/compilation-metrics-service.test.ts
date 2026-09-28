import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  compilationFindMany: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    compilation: { findMany: mocks.compilationFindMany },
  },
}));

import { getCompileSlaReport } from '@/services/compilation-metrics-service';
import { COMPILE_SLA } from '@/lib/constants';

describe('getCompileSlaReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.compilationFindMany.mockResolvedValue([
      { status: 'success', durationMs: 100 },
      { status: 'success', durationMs: 300 },
      { status: 'error', durationMs: null },
    ]);
  });

  it('queries the 24h and 7d windows and summarizes each against the SLA target', async () => {
    const now = new Date('2026-06-23T12:00:00.000Z');
    const report = await getCompileSlaReport(now);

    expect(report.targetP95Ms).toBe(COMPILE_SLA.TARGET_P95_MS);
    expect(report.generatedAt).toBe(now.toISOString());
    expect(report.last24h.total).toBe(3);
    expect(report.last24h.success).toBe(2);
    expect(report.last24h.failed).toBe(1);
    expect(report.last7d.successRate).toBe(67); // round(2/3*100)

    // Two queries, one per window, with the correct lower bounds.
    expect(mocks.compilationFindMany).toHaveBeenCalledTimes(2);
    const sinceValues = mocks.compilationFindMany.mock.calls.map(
      (c) => c[0].where.createdAt.gte as Date,
    );
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    expect(sinceValues.map((d) => d.toISOString())).toEqual(
      expect.arrayContaining([dayAgo.toISOString(), weekAgo.toISOString()]),
    );
    // Only the columns needed for the summary are selected.
    expect(mocks.compilationFindMany.mock.calls[0][0].select).toEqual({
      status: true,
      durationMs: true,
    });
  });

  it('reports an empty window safely', async () => {
    mocks.compilationFindMany.mockResolvedValue([]);
    const report = await getCompileSlaReport(new Date('2026-06-23T12:00:00.000Z'));
    expect(report.last24h.total).toBe(0);
    expect(report.last24h.durations).toBeNull();
    expect(report.last24h.meetsTarget).toBeNull();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  userFindMany: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: mocks.userFindMany },
  },
}));

import { getAttributionReport } from '@/services/attribution-service';
import { ANALYTICS } from '@/lib/constants';

function withSource(source?: string) {
  return {
    settings: source
      ? { attribution: { source, capturedAt: '2026-06-25T00:00:00.000Z' } }
      : {},
  };
}

describe('getAttributionReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userFindMany.mockResolvedValue([
      withSource('google'),
      withSource('google'),
      withSource('twitter'),
      withSource(),
    ]);
  });

  it('aggregates the settings scan into a top-sources report', async () => {
    const now = new Date('2026-06-26T00:00:00.000Z');
    const report = await getAttributionReport(now);

    expect(report.totalUsers).toBe(4);
    expect(report.attributed).toBe(3);
    expect(report.unattributed).toBe(1);
    expect(report.sources[0]).toEqual({ source: 'google', count: 2, pct: 67 });
    expect(report.sampled).toBe(false);
    expect(report.scanLimit).toBe(ANALYTICS.ATTRIBUTION_SCAN_LIMIT);
    expect(report.generatedAt).toBe(now.toISOString());
  });

  it('scans only the settings column, newest first, bounded by the scan limit', async () => {
    await getAttributionReport(new Date('2026-06-26T00:00:00.000Z'));
    const arg = mocks.userFindMany.mock.calls[0][0];
    expect(arg.select).toEqual({ settings: true });
    expect(arg.orderBy).toEqual({ createdAt: 'desc' });
    // Fetch one extra row to detect truncation.
    expect(arg.take).toBe(ANALYTICS.ATTRIBUTION_SCAN_LIMIT + 1);
  });

  it('flags sampled=true and does not over-count when the scan limit is exceeded', async () => {
    const rows = Array.from({ length: ANALYTICS.ATTRIBUTION_SCAN_LIMIT + 1 }, () =>
      withSource('google'),
    );
    mocks.userFindMany.mockResolvedValue(rows);

    const report = await getAttributionReport(new Date('2026-06-26T00:00:00.000Z'));
    expect(report.sampled).toBe(true);
    expect(report.totalUsers).toBe(ANALYTICS.ATTRIBUTION_SCAN_LIMIT); // extra row trimmed
  });
});

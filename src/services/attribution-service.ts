/**
 * Campaign attribution-source breakdown for the admin acquisition widget.
 * Attribution lives in the settings JSON (not cheaply countable), so this scans
 * user rows. The scan is bounded by `ANALYTICS.ATTRIBUTION_SCAN_LIMIT`; beyond
 * it the report is flagged `sampled` (newest-first) rather than silently
 * truncated.
 */
import { prisma } from '@/lib/prisma';
import { ANALYTICS } from '@/lib/constants';
import {
  aggregateAttributionSources,
  type AttributionReport,
} from '@/lib/attribution-report';

export interface AttributionReportWithMeta extends AttributionReport {
  sampled: boolean;
  scanLimit: number;
  generatedAt: string;
}

const TOP_N = 8;

export async function getAttributionReport(
  now: Date = new Date(),
): Promise<AttributionReportWithMeta> {
  const limit = ANALYTICS.ATTRIBUTION_SCAN_LIMIT;
  // Fetch one extra row to detect (and flag) truncation.
  const rows = await prisma.user.findMany({
    select: { settings: true },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  });

  const sampled = rows.length > limit;
  const scanned = sampled ? rows.slice(0, limit) : rows;

  return {
    ...aggregateAttributionSources(
      scanned.map((r) => r.settings),
      { topN: TOP_N },
    ),
    sampled,
    scanLimit: limit,
    generatedAt: now.toISOString(),
  };
}

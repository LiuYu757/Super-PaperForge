/**
 * Pure aggregation of first-touch campaign attribution into a top-sources
 * breakdown for the admin acquisition widget. IO-free and unit-testable; the
 * service feeds it the `settings` blobs.
 *
 * "Attributed" = the user has a stored `settings.attribution` (see
 * src/lib/campaign.ts). Attribution without an explicit `source` (e.g. only a
 * referrer) is bucketed under `(unknown)`.
 */
import { pct } from '@/lib/funnel';
import { getCampaignAttribution } from '@/lib/campaign';

export interface AttributionSource {
  source: string;
  count: number;
  /** Share of attributed users, integer percentage. */
  pct: number | null;
}

export interface AttributionReport {
  totalUsers: number;
  attributed: number;
  unattributed: number;
  /** Top N sources by count, descending. */
  sources: AttributionSource[];
  /** Attributed users whose source fell outside the top N. */
  otherCount: number;
}

export function aggregateAttributionSources(
  settingsList: unknown[],
  opts: { topN: number },
): AttributionReport {
  const counts = new Map<string, number>();
  let attributed = 0;

  for (const settings of settingsList) {
    const attribution = getCampaignAttribution(settings);
    if (!attribution) continue;
    attributed += 1;
    const source = attribution.source || '(unknown)';
    counts.set(source, (counts.get(source) ?? 0) + 1);
  }

  const ranked = [...counts.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));

  const top = ranked.slice(0, opts.topN);
  const otherCount = ranked.slice(opts.topN).reduce((sum, x) => sum + x.count, 0);

  return {
    totalUsers: settingsList.length,
    attributed,
    unattributed: settingsList.length - attributed,
    sources: top.map(({ source, count }) => ({ source, count, pct: pct(count, attributed) })),
    otherCount,
  };
}

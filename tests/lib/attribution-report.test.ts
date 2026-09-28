import { describe, it, expect } from 'vitest';
import { aggregateAttributionSources } from '@/lib/attribution-report';

function s(source?: string, referrer?: string) {
  if (!source && !referrer) return { settings: {} };
  const attribution: Record<string, string> = { capturedAt: '2026-06-25T00:00:00.000Z' };
  if (source) attribution.source = source;
  if (referrer) attribution.referrer = referrer;
  return { settings: { attribution } };
}

describe('aggregateAttributionSources', () => {
  it('counts attributed users by source and computes share of attributed', () => {
    const rows = [s('google'), s('google'), s('google'), s('twitter'), s('twitter'), s()];
    const report = aggregateAttributionSources(
      rows.map((r) => r.settings),
      { topN: 10 },
    );
    expect(report.totalUsers).toBe(6);
    expect(report.attributed).toBe(5);
    expect(report.unattributed).toBe(1);
    expect(report.sources).toEqual([
      { source: 'google', count: 3, pct: 60 },
      { source: 'twitter', count: 2, pct: 40 },
    ]);
    expect(report.otherCount).toBe(0);
  });

  it('limits to topN and rolls the rest into otherCount', () => {
    const rows = [s('google'), s('google'), s('twitter'), s('bing')];
    const report = aggregateAttributionSources(
      rows.map((r) => r.settings),
      { topN: 1 },
    );
    expect(report.sources).toEqual([{ source: 'google', count: 2, pct: 50 }]);
    expect(report.otherCount).toBe(2); // twitter + bing
  });

  it('buckets attribution without a source under (unknown)', () => {
    const rows = [s(undefined, 'news.ycombinator.com'), s('google')];
    const report = aggregateAttributionSources(
      rows.map((r) => r.settings),
      { topN: 10 },
    );
    expect(report.attributed).toBe(2);
    const unknown = report.sources.find((x) => x.source === '(unknown)');
    expect(unknown?.count).toBe(1);
  });

  it('handles an empty list', () => {
    const report = aggregateAttributionSources([], { topN: 10 });
    expect(report).toEqual({
      totalUsers: 0,
      attributed: 0,
      unattributed: 0,
      sources: [],
      otherCount: 0,
    });
  });

  it('sorts sources by count descending', () => {
    const rows = [s('a'), s('b'), s('b'), s('c'), s('c'), s('c')];
    const report = aggregateAttributionSources(
      rows.map((r) => r.settings),
      { topN: 10 },
    );
    expect(report.sources.map((x) => x.source)).toEqual(['c', 'b', 'a']);
  });
});

import { describe, it, expect } from 'vitest';
import { percentile, summarizeCompileSla } from '@/lib/compile-sla';

describe('percentile', () => {
  it('returns null for an empty set', () => {
    expect(percentile([], 95)).toBeNull();
  });

  it('returns the single value regardless of p', () => {
    expect(percentile([42], 95)).toBe(42);
    expect(percentile([42], 0)).toBe(42);
  });

  it('computes the median with linear interpolation', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5.5);
  });

  it('computes p0 and p100 as min and max', () => {
    expect(percentile([5, 1, 3, 2, 4], 0)).toBe(1);
    expect(percentile([5, 1, 3, 2, 4], 100)).toBe(5);
  });

  it('interpolates p95 between ranks and is order-independent', () => {
    const values = [500, 100, 400, 200, 300];
    // sorted [100,200,300,400,500], rank = .95*4 = 3.8 -> 400 + .8*(500-400) = 480
    expect(percentile(values, 95)).toBe(480);
  });
});

describe('summarizeCompileSla', () => {
  const rows = [
    { status: 'success', durationMs: 100 },
    { status: 'success', durationMs: 200 },
    { status: 'success', durationMs: 300 },
    { status: 'success', durationMs: 400 },
    { status: 'success', durationMs: 500 },
    { status: 'error', durationMs: 50 },
    { status: 'timeout', durationMs: null },
  ];

  it('summarizes counts, success rate, and latency percentiles over successful builds', () => {
    const summary = summarizeCompileSla(rows, { targetP95Ms: 10000 });
    expect(summary.total).toBe(7);
    expect(summary.success).toBe(5);
    expect(summary.failed).toBe(2);
    expect(summary.successRate).toBe(71); // round(5/7*100) = 71
    expect(summary.sampleCount).toBe(5);
    expect(summary.durations).toEqual({ p50: 300, p95: 480, p99: 496, avg: 300, max: 500 });
    expect(summary.meetsTarget).toBe(true);
  });

  it('flags an SLA breach when p95 exceeds the target', () => {
    const summary = summarizeCompileSla(rows, { targetP95Ms: 400 });
    expect(summary.meetsTarget).toBe(false);
  });

  it('handles an empty window without dividing by zero', () => {
    const summary = summarizeCompileSla([], { targetP95Ms: 10000 });
    expect(summary.total).toBe(0);
    expect(summary.successRate).toBe(0);
    expect(summary.sampleCount).toBe(0);
    expect(summary.durations).toBeNull();
    expect(summary.meetsTarget).toBeNull();
  });

  it('counts every non-success terminal status as failed', () => {
    const summary = summarizeCompileSla(
      [
        { status: 'success', durationMs: 10 },
        { status: 'error', durationMs: null },
        { status: 'timeout', durationMs: null },
        { status: 'failed', durationMs: null },
      ],
      { targetP95Ms: 10000 },
    );
    expect(summary.success).toBe(1);
    expect(summary.failed).toBe(3);
  });

  it('ignores successful rows without a recorded duration in percentiles', () => {
    const summary = summarizeCompileSla(
      [
        { status: 'success', durationMs: null },
        { status: 'success', durationMs: 200 },
      ],
      { targetP95Ms: 10000 },
    );
    expect(summary.success).toBe(2);
    expect(summary.sampleCount).toBe(1);
    expect(summary.durations?.max).toBe(200);
  });
});

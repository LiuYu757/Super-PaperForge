/**
 * Pure compilation-SLA math. Kept free of Prisma/IO so the percentile and
 * summary logic is unit-testable in isolation; the service layer feeds it rows.
 *
 * "SLA" here is measured from data we already persist: per-compilation status
 * and duration. We report latency percentiles over *successful* builds (the
 * paid value proposition is fast successful compiles), plus throughput and
 * success rate, and whether p95 meets a target.
 */

export interface CompileRow {
  status: string;
  durationMs: number | null;
}

export interface CompileDurations {
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  max: number;
}

export interface CompileSlaSummary {
  total: number;
  success: number;
  failed: number;
  /** Integer percentage 0–100. */
  successRate: number;
  /** Number of successful builds with a recorded duration (the percentile sample). */
  sampleCount: number;
  durations: CompileDurations | null;
  targetP95Ms: number;
  /** True/false against the target, or null when there is no sample. */
  meetsTarget: boolean | null;
}

/**
 * Linear-interpolation percentile (same method as common observability tools).
 * `p` is 0–100. Returns null for an empty input; input order does not matter.
 */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];

  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  const frac = rank - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}

function roundOrNull(value: number | null): number {
  return value === null ? 0 : Math.round(value);
}

export function summarizeCompileSla(
  rows: CompileRow[],
  opts: { targetP95Ms: number },
): CompileSlaSummary {
  const total = rows.length;
  const success = rows.filter((r) => r.status === 'success').length;
  const failed = total - success;
  const successRate = total > 0 ? Math.round((success / total) * 100) : 0;

  const sample = rows
    .filter((r) => r.status === 'success' && typeof r.durationMs === 'number')
    .map((r) => r.durationMs as number);

  let durations: CompileDurations | null = null;
  let meetsTarget: boolean | null = null;

  if (sample.length > 0) {
    const p95 = percentile(sample, 95) as number;
    durations = {
      p50: roundOrNull(percentile(sample, 50)),
      p95: roundOrNull(p95),
      p99: roundOrNull(percentile(sample, 99)),
      avg: Math.round(sample.reduce((a, b) => a + b, 0) / sample.length),
      max: Math.max(...sample),
    };
    meetsTarget = p95 <= opts.targetP95Ms;
  }

  return {
    total,
    success,
    failed,
    successRate,
    sampleCount: sample.length,
    durations,
    targetP95Ms: opts.targetP95Ms,
    meetsTarget,
  };
}

/**
 * Compilation SLA reporting. Aggregates the persisted per-compilation status
 * and duration into latency percentiles, success rate, and throughput over
 * rolling windows, then evaluates them against the SLA target. No schema change
 * is required — it reads the existing `compilations` table.
 */
import { prisma } from '@/lib/prisma';
import { COMPILE_SLA } from '@/lib/constants';
import { summarizeCompileSla, type CompileSlaSummary } from '@/lib/compile-sla';

async function windowSummary(since: Date): Promise<CompileSlaSummary> {
  const rows = await prisma.compilation.findMany({
    where: { createdAt: { gte: since } },
    select: { status: true, durationMs: true },
  });
  return summarizeCompileSla(rows, { targetP95Ms: COMPILE_SLA.TARGET_P95_MS });
}

export interface CompileSlaReport {
  targetP95Ms: number;
  last24h: CompileSlaSummary;
  last7d: CompileSlaSummary;
  generatedAt: string;
}

/**
 * Build the SLA report for the admin widget. `now` is injectable for tests.
 */
export async function getCompileSlaReport(now: Date = new Date()): Promise<CompileSlaReport> {
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [last24h, last7d] = await Promise.all([
    windowSummary(dayAgo),
    windowSummary(weekAgo),
  ]);

  return {
    targetP95Ms: COMPILE_SLA.TARGET_P95_MS,
    last24h,
    last7d,
    generatedAt: now.toISOString(),
  };
}

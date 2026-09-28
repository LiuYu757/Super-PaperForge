/**
 * Growth-funnel reporting for the admin trial-conversion dashboard. Uses only
 * cheap, indexable counts — total users, verified users (emailVerified column),
 * project owners (relation filter), and subscription audit events — so it never
 * scans the settings JSON. Activation markers live in settings for per-user
 * funnels; this aggregate uses the column/relation/audit signals that are
 * directly countable.
 */
import { prisma } from '@/lib/prisma';
import { buildFunnel, type FunnelReport } from '@/lib/funnel';

export interface FunnelReportWithMeta extends FunnelReport {
  generatedAt: string;
}

export async function getFunnelReport(now: Date = new Date()): Promise<FunnelReportWithMeta> {
  const [registered, verified, createdProject, activated, canceled] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { emailVerified: true } }),
    prisma.user.count({ where: { projectMembers: { some: { role: 'owner' } } } }),
    prisma.auditLog.count({ where: { action: 'billing.subscription_activated' } }),
    prisma.auditLog.count({ where: { action: 'billing.subscription_canceled' } }),
  ]);

  return {
    ...buildFunnel({ registered, verified, createdProject, activated, canceled }),
    generatedAt: now.toISOString(),
  };
}

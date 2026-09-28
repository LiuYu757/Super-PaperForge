import { auth } from '@/lib/auth';
import { errorResponse } from '@/lib/errors';
import { apiSuccess, ApiErrors } from '@/lib/api-response';
import { enforceRateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';
import { getCompileSlaReport } from '@/services/compilation-metrics-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/admin/compile-sla
 * Compilation latency SLA report (p50/p95/p99, success rate, throughput) over
 * rolling 24h / 7d windows, with target compliance. Admin-only, read-only.
 */
export async function GET() {
  try {
    const session = await auth();
    const userRole = (session?.user as { role?: string } | undefined)?.role;
    if (!session?.user || userRole !== 'admin') return ApiErrors.forbidden();
    const adminId = (session.user as { id: string }).id;

    const limited = await enforceRateLimit(`rate:admin-list:${adminId}`, RATE_LIMITS.ADMIN_LIST);
    if (limited) return limited;

    const report = await getCompileSlaReport();
    return apiSuccess(report);
  } catch (error) {
    return errorResponse(error);
  }
}

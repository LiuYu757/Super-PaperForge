import { auth } from '@/lib/auth';
import { errorResponse } from '@/lib/errors';
import { apiSuccess, ApiErrors } from '@/lib/api-response';
import { enforceRateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';
import { getFunnelReport } from '@/services/funnel-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/admin/funnel
 * Acquisition→activation funnel + paid conversion/churn for the admin growth
 * dashboard. Admin-only, read-only, built from cheap indexable counts.
 */
export async function GET() {
  try {
    const session = await auth();
    const userRole = (session?.user as { role?: string } | undefined)?.role;
    if (!session?.user || userRole !== 'admin') return ApiErrors.forbidden();
    const adminId = (session.user as { id: string }).id;

    const limited = await enforceRateLimit(`rate:admin-list:${adminId}`, RATE_LIMITS.ADMIN_LIST);
    if (limited) return limited;

    const report = await getFunnelReport();
    return apiSuccess(report);
  } catch (error) {
    return errorResponse(error);
  }
}

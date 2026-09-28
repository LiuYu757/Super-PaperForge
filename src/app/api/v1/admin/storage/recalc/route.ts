import { auth } from '@/lib/auth';
import { errorResponse } from '@/lib/errors';
import { apiSuccess, ApiErrors } from '@/lib/api-response';
import { enforceRateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';
import { recalculateAllUsersStorage } from '@/lib/storage';
import { logAuditAction } from '@/services/audit-service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/admin/storage/recalc
 * Recompute every account's cached storage usage from the files table.
 * Admin-only repair/backfill for the storageUsedBytes cache.
 */
export async function POST() {
  try {
    const session = await auth();
    const role = (session?.user as { role?: string } | undefined)?.role;
    if (!session?.user || role !== 'admin') return ApiErrors.forbidden();
    const adminId = (session.user as { id: string }).id;

    const limited = await enforceRateLimit(`rate:admin-mutate:${adminId}`, RATE_LIMITS.ADMIN_MUTATE);
    if (limited) return limited;

    const result = await recalculateAllUsersStorage();
    await logAuditAction(adminId, 'storage.recalculate', 'system', adminId, result);

    return apiSuccess(result);
  } catch (error) {
    return errorResponse(error);
  }
}

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { errorResponse } from '@/lib/errors';
import { ApiErrors, apiSuccess } from '@/lib/api-response';
import { getAuditLog } from '@/services/audit-service';
import { enforceRateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const userRole = (session?.user as { role?: string } | undefined)?.role;
    if (!session?.user || userRole !== 'admin') {
      return ApiErrors.forbidden();
    }
    const adminId = (session.user as { id: string }).id;

    const limited = await enforceRateLimit(`rate:admin-list:${adminId}`, RATE_LIMITS.ADMIN_LIST);
    if (limited) return limited;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10) || 50));

    const result = await getAuditLog(page, limit);
    return apiSuccess(result);
  } catch (error) {
    return errorResponse(error);
  }
}

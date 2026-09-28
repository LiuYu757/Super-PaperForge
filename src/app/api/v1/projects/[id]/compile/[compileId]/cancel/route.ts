import { NextRequest } from 'next/server';
import { apiSuccess } from '@/lib/api-response';
import { errorResponse } from '@/lib/errors';
import { authenticateRequest } from '@/lib/api-auth';
import { assertTokenAccess } from '@/services/api-token-service';
import { enforceRateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';
import { requestCompilationCancel } from '@/services/compilation-service';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; compileId: string }> },
) {
  try {
    const principal = await authenticateRequest(request);
    const { id, compileId } = await params;
    await assertTokenAccess(principal, id, 'compile:run', ['owner', 'editor']);
    const limited = await enforceRateLimit(`rate:compile-cancel:${principal.userId}`,
      RATE_LIMITS.COMPILATION, 'Too many cancellation requests');
    if (limited) return limited;
    const row = await requestCompilationCancel(id, compileId, principal.userId);
    return apiSuccess({ compilationId: row.id, status: row.status,
      cancelRequestedAt: row.cancelRequestedAt });
  } catch (error) {
    return errorResponse(error);
  }
}

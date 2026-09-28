import { auth } from '@/lib/auth';
import { apiSuccess, ApiErrors } from '@/lib/api-response';
import { errorResponse } from '@/lib/errors';
import { revokeShareLink } from '@/services/member-service';
import { enforceRateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';
import { logAuditAction } from '@/services/audit-service';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string; linkId: string }> };

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return ApiErrors.unauthorized();
    }
    const requesterId = (session.user as { id: string }).id;
    const { id, linkId } = await params;

    const limited = await enforceRateLimit(`rate:share-link:${requesterId}`, RATE_LIMITS.SHARE_LINK);
    if (limited) return limited;

    const result = await revokeShareLink(id, requesterId, linkId);

    logAuditAction(requesterId, 'share_link.revoked', 'project', id, { linkId }).catch(() => {});

    return apiSuccess(result);
  } catch (error) {
    return errorResponse(error);
  }
}

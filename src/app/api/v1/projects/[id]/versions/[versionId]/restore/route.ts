import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { apiSuccess, ApiErrors } from '@/lib/api-response';
import { errorResponse } from '@/lib/errors';
import { assertProjectRole } from '@/services/project-service';
import { restoreVersion } from '@/services/version-service';
import { enforceRateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';
import { logAuditAction } from '@/services/audit-service';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string; versionId: string }> };

export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return ApiErrors.unauthorized();
    }
    const userId = (session.user as { id: string }).id;
    const { id, versionId } = await params;

    const limited = await enforceRateLimit(`rate:version-restore:${userId}`, RATE_LIMITS.VERSION_RESTORE);
    if (limited) return limited;

    // Only owners and editors can restore versions
    await assertProjectRole(id, userId, ['owner', 'editor']);

    const version = await restoreVersion(id, versionId, userId);

    logAuditAction(userId, 'version.restored', 'project', id, { versionId }).catch(() => {});

    return apiSuccess(version);
  } catch (error) {
    return errorResponse(error);
  }
}

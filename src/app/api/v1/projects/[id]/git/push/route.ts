import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { apiSuccess, ApiErrors } from '@/lib/api-response';
import { errorResponse } from '@/lib/errors';
import { assertProjectRole } from '@/services/project-service';
import { pushToRemote } from '@/services/git-service';
import { enforceRateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';
import { logAuditAction } from '@/services/audit-service';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return ApiErrors.unauthorized();
    }
    const userId = (session.user as { id: string }).id;
    const { id } = await params;

    await assertProjectRole(id, userId, ['owner', 'editor']);

    const limited = await enforceRateLimit(
      `rate:git-push:${userId}:${id}`,
      RATE_LIMITS.GIT_OP,
      'Too many git push requests. Please wait before retrying.',
    );
    if (limited) return limited;

    await pushToRemote(id, userId);

    logAuditAction(userId, 'git.pushed', 'project', id).catch(() => {});

    return apiSuccess({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}

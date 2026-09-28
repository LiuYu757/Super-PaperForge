import { NextRequest } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { apiSuccess, ApiErrors } from '@/lib/api-response';
import { errorResponse } from '@/lib/errors';
import { assertProjectRole } from '@/services/project-service';
import { linkGitRemote } from '@/services/git-service';
import { gitRemoteUrlSchema } from '@/lib/validation';
import { enforceRateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';
import { logAuditAction } from '@/services/audit-service';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

const linkSchema = z.object({
  remoteUrl: gitRemoteUrlSchema,
});

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return ApiErrors.unauthorized();
    }
    const userId = (session.user as { id: string }).id;
    const { id } = await params;

    const limited = await enforceRateLimit(`rate:git-op:${userId}:${id}`, RATE_LIMITS.GIT_OP);
    if (limited) return limited;

    await assertProjectRole(id, userId, ['owner']);

    const body = await request.json();
    const { remoteUrl } = linkSchema.parse(body);

    await linkGitRemote(id, remoteUrl);

    logAuditAction(userId, 'git.linked', 'project', id, { remoteUrl }).catch(() => {});

    return apiSuccess({ success: true, remoteUrl });
  } catch (error) {
    return errorResponse(error);
  }
}

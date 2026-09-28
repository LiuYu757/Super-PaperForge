import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { errorResponse } from '@/lib/errors';
import { deleteGitCredential } from '@/services/git-service';
import { apiSuccess, ApiErrors } from '@/lib/api-response';
import { enforceRateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';
import { logAuditAction } from '@/services/audit-service';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ credentialId: string }> };

export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams,
) {
  try {
    const session = await auth();
    if (!session?.user) return ApiErrors.unauthorized();
    const userId = (session.user as { id: string }).id;
    const { credentialId } = await params;

    const limited = await enforceRateLimit(`rate:git-cred-del:${userId}`, RATE_LIMITS.GIT_CREDENTIAL_DELETE);
    if (limited) return limited;

    await deleteGitCredential(credentialId, userId);

    logAuditAction(userId, 'git_credential.deleted', 'git_credential', credentialId).catch(() => {});

    return apiSuccess({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}

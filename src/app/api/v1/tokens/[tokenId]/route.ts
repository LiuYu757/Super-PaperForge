import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { apiSuccess, ApiErrors } from '@/lib/api-response';
import { errorResponse } from '@/lib/errors';
import { revokeApiToken } from '@/services/api-token-service';
import { enforceRateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';
import { logAuditAction } from '@/services/audit-service';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ tokenId: string }> };

/**
 * Revoke a token. Takes effect on the next request: `resolveToken` checks
 * `revokedAt` on every call rather than caching the decision.
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) return ApiErrors.unauthorized();
    const userId = (session.user as { id: string }).id;
    const { tokenId } = await params;

    const limited = await enforceRateLimit(
      `rate:token-revoke:${userId}`,
      RATE_LIMITS.TOKEN_MANAGE,
      'Too many token requests. Please slow down.',
    );
    if (limited) return limited;

    // Scoped by userId inside the service, so one user cannot revoke another's
    // token by guessing an ID.
    const revoked = await revokeApiToken(tokenId, userId);

    logAuditAction(userId, 'token.revoked', 'user', userId, { tokenId, revoked }).catch(() => {});

    // Idempotent: revoking an already-revoked token is a success, not an error.
    return apiSuccess({ revoked, tokenId });
  } catch (error) {
    return errorResponse(error);
  }
}

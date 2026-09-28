import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { apiSuccess, apiError, ApiErrors } from '@/lib/api-response';
import { errorResponse } from '@/lib/errors';
import { createApiToken, listApiTokens, ALL_SCOPES, type Scope } from '@/services/api-token-service';
import { enforceRateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';
import { logAuditAction } from '@/services/audit-service';

export const dynamic = 'force-dynamic';

/**
 * Personal access tokens.
 *
 * Deliberately session-only: a token cannot mint another token. There is no
 * `token:write` scope, so compromising an automation credential does not let an
 * attacker issue fresh ones or extend their own reach.
 */

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return ApiErrors.unauthorized();
    const userId = (session.user as { id: string }).id;

    // Never includes hashes.
    return apiSuccess({ tokens: await listApiTokens(userId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return ApiErrors.unauthorized();
    const userId = (session.user as { id: string }).id;

    // Token minting is credential issuance: rate limit it tightly.
    const limited = await enforceRateLimit(
      `rate:token-create:${userId}`,
      RATE_LIMITS.TOKEN_MANAGE,
      'Too many token requests. Please slow down.',
    );
    if (limited) return limited;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError('Request body must be valid JSON', 400, 'INVALID_BODY');
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return apiError('Request body must be a JSON object', 400, 'INVALID_BODY');
    }
    const payload = body as Record<string, unknown>;

    if (typeof payload.name !== 'string' || !payload.name.trim()) {
      return apiError('A token name is required', 400, 'INVALID_NAME');
    }
    if (!Array.isArray(payload.scopes) || payload.scopes.length === 0) {
      return apiError(
        `scopes must be a non-empty array. Available: ${ALL_SCOPES.join(', ')}`,
        400,
        'INVALID_SCOPES',
      );
    }
    if (payload.projectIds !== undefined && !Array.isArray(payload.projectIds)) {
      return apiError('projectIds must be an array of project IDs', 400, 'INVALID_PROJECT_IDS');
    }

    const token = await createApiToken({
      userId,
      name: payload.name,
      scopes: payload.scopes as Scope[],
      projectIds: (payload.projectIds as string[] | undefined) ?? [],
      expiresInDays:
        typeof payload.expiresInDays === 'number' ? payload.expiresInDays : undefined,
    });

    // Record issuance, scopes and target projects — never the token itself.
    logAuditAction(userId, 'token.created', 'user', userId, {
      tokenId: token.id,
      name: token.name,
      scopes: token.scopes,
      projectIds: token.projectIds,
      expiresAt: token.expiresAt,
    }).catch(() => {});

    // The plaintext appears here and nowhere else, ever.
    return apiSuccess(
      {
        ...token,
        warning: 'Copy this token now — it cannot be retrieved again.',
      },
      201,
    );
  } catch (error) {
    return errorResponse(error);
  }
}

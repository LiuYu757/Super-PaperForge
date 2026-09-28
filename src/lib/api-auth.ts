import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { resolveToken, type Principal } from '@/services/api-token-service';

/**
 * Request authentication for `/api/v1` routes that serve both the browser and
 * external automation.
 *
 * Order matters: a request presenting a Bearer token is authenticated *as that
 * token*. An invalid Bearer is a failed authentication, never a silent fallback
 * to the session cookie — otherwise a revoked token would quietly keep working
 * from a browser that still holds a session.
 */
export async function authenticateRequest(request: NextRequest): Promise<Principal> {
  const header = request.headers.get('authorization');

  if (header) {
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (!match) {
      throw new ApiError(401, 'Malformed Authorization header');
    }
    const principal = await resolveToken(match[1]);
    if (!principal) {
      // Covers unknown, expired and revoked tokens alike; distinguishing them
      // would let a caller probe which tokens exist.
      throw new ApiError(401, 'Invalid or expired token');
    }

    // A token is only as good as its owner's standing.
    const user = await prisma.user.findUnique({
      where: { id: principal.userId },
      select: { id: true },
    });
    if (!user) throw new ApiError(401, 'Token owner no longer exists');

    return principal;
  }

  const session = await auth();
  if (!session?.user) {
    throw new ApiError(401, 'Authentication required');
  }
  return { kind: 'user', userId: (session.user as { id: string }).id };
}

/** Stable identity string for idempotency bookkeeping. */
export function principalKey(principal: Principal): string {
  return principal.kind === 'token' ? `token:${principal.tokenId}` : `user:${principal.userId}`;
}

/** SHA-256 over a canonical form of the request body. */
export function hashRequestBody(body: unknown): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, canonical(nested)]));
    }
    return value;
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonical(body ?? null)), 'utf-8').digest('hex');
}

import { NextRequest } from 'next/server';
import { apiSuccess, apiError } from '@/lib/api-response';
import { errorResponse } from '@/lib/errors';
import {
  authenticateRequest,
  principalKey,
  hashRequestBody,
} from '@/lib/api-auth';
import { assertFeature } from '@/lib/features';
import { assertTokenAccess } from '@/services/api-token-service';
import { applyChangeSet } from '@/services/changeset-service';
import { enforceRateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string; cid: string }> };

/**
 * Apply a changeset to the live document.
 *
 * Compare-and-set on the project revision. If anyone committed since the
 * changeset was created the response is 409 and the live text is untouched;
 * the caller re-reads and rebuilds. No silent merge, no overwrite.
 *
 * A token with `changeset:apply` may call this directly — human approval is
 * available as a step but is not mandatory.
 *
 * The live-write path is gated behind ENABLE_EXTERNAL_APPLY (off by default in
 * selfhost mode, PR-0/PR-1 guard). Until the unified mutation core and the
 * versioned editor protocol are proven, applying from outside is refused even
 * with a valid token.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    assertFeature('externalApply');
    const principal = await authenticateRequest(request);
    const { id, cid } = await params;
    await assertTokenAccess(principal, id, 'changeset:apply', ['owner', 'editor']);

    const limited = await enforceRateLimit(
      `rate:changeset-apply:${principal.userId}`,
      RATE_LIMITS.FILE_WRITE,
      'Too many apply requests. Please slow down.',
    );
    if (limited) return limited;

    // The body is optional; an explicit baseRevision is an extra guard.
    let payload: Record<string, unknown> = {};
    const raw = await request.text();
    if (raw.trim()) {
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          return apiError('Request body must be a JSON object', 400, 'INVALID_BODY');
        }
        payload = parsed as Record<string, unknown>;
      } catch {
        return apiError('Request body must be valid JSON', 400, 'INVALID_BODY');
      }
    }

    // The idempotency key is claimed inside the apply transaction (PR-1, R06):
    // two concurrent requests with the same key cannot both execute the apply —
    // the loser replays the winner's stored response instead.
    const idempotencyKey = request.headers.get('idempotency-key');
    const applied = await applyChangeSet(
      id,
      cid,
      typeof payload.baseRevision === 'string' ? payload.baseRevision : undefined,
      idempotencyKey
        ? {
            principal: principalKey(principal),
            operation: `changeset.apply:${cid}`,
            idempotencyKey,
            requestHash: hashRequestBody(payload),
          }
        : undefined,
    );

    return apiSuccess({ changeSetId: applied.changeSet.id,
      status: applied.changeSet.status, revision: applied.revision,
      appliedAt: applied.changeSet.appliedAt, replayed: applied.replayed });
  } catch (error) {
    return errorResponse(error);
  }
}

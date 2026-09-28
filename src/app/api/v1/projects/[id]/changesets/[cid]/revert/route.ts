import { NextRequest } from 'next/server';
import { apiSuccess } from '@/lib/api-response';
import { errorResponse } from '@/lib/errors';
import { authenticateRequest, hashRequestBody, principalKey } from '@/lib/api-auth';
import { assertFeature } from '@/lib/features';
import { assertTokenAccess } from '@/services/api-token-service';
import { revertChangeSet } from '@/services/changeset-service';
import { revisionToString } from '@/services/snapshot-service';
import { enforceRateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string; cid: string }> };

/**
 * Build the inverse of an applied changeset as a new candidate.
 *
 * Undo is a forward change, reviewed and applied through the same path as any
 * other. It is deliberately not a project-wide reset: if a file has been edited
 * since, this returns 409 rather than discarding that person's work.
 *
 * Like apply, revert is a live write and is gated behind ENABLE_EXTERNAL_APPLY.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    assertFeature('externalApply');
    const principal = await authenticateRequest(request);
    const { id, cid } = await params;
    await assertTokenAccess(principal, id, 'changeset:write', ['owner', 'editor']);

    const limited = await enforceRateLimit(
      `rate:changeset-revert:${principal.userId}`,
      RATE_LIMITS.FILE_WRITE,
      'Too many revert requests. Please slow down.',
    );
    if (limited) return limited;

    const key = request.headers.get('idempotency-key');
    const changeSet = await revertChangeSet(id, cid, principal,
      key ? { principal: principalKey(principal), operation: `changeset.revert:${cid}`,
        idempotencyKey: key, requestHash: hashRequestBody({}) } : undefined);

    return apiSuccess({
      changeSetId: changeSet.id,
      status: changeSet.status,
      revertsId: changeSet.revertsId,
      baseSnapshotId: changeSet.baseSnapshotId,
      baseRevision: revisionToString(changeSet.baseRevision),
      diff: changeSet.diff,
      // The inverse is a candidate: it still has to be applied.
      message: changeSet.message,
      createdAt: changeSet.createdAt,
      replayed: changeSet.replayed,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

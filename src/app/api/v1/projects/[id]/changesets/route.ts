import { NextRequest } from 'next/server';
import { apiSuccess, apiError } from '@/lib/api-response';
import { errorResponse } from '@/lib/errors';
import { authenticateRequest, hashRequestBody, principalKey } from '@/lib/api-auth';
import { assertTokenAccess } from '@/services/api-token-service';
import { createChangeSet } from '@/services/changeset-service';
import { revisionToString } from '@/services/snapshot-service';
import { enforceRateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Create a candidate changeset.
 *
 * This does not modify the live document. The result can be inspected, compiled
 * and only then applied — so a failed compile costs nothing and never leaves
 * the shared manuscript in a broken state.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const principal = await authenticateRequest(request);
    const { id } = await params;
    await assertTokenAccess(principal, id, 'changeset:write', ['owner', 'editor']);

    const limited = await enforceRateLimit(
      `rate:changeset:${principal.userId}`,
      RATE_LIMITS.FILE_WRITE,
      'Too many changeset operations. Please slow down.',
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

    const key = request.headers.get('idempotency-key');
    const changeSet = await createChangeSet({
          projectId: id,
          principal,
          baseSnapshotId:
            typeof payload.baseSnapshotId === 'string' ? payload.baseSnapshotId : undefined,
          baseRevision:
            typeof payload.baseRevision === 'string' ? payload.baseRevision : undefined,
          message: typeof payload.message === 'string' ? payload.message : undefined,
          operations: payload.operations,
          idempotency: key ? { principal: principalKey(principal),
            operation: 'changeset.create', idempotencyKey: key,
            requestHash: hashRequestBody(payload) } : undefined,
    });

    return apiSuccess({ changeSetId: changeSet.id, status: changeSet.status,
      baseSnapshotId: changeSet.baseSnapshotId,
      baseRevision: revisionToString(changeSet.baseRevision),
      resultHash: changeSet.resultHash, diff: changeSet.diff,
      createdAt: changeSet.createdAt, replayed: changeSet.replayed });
  } catch (error) {
    return errorResponse(error);
  }
}

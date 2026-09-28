import { NextRequest } from 'next/server';
import { apiSuccess } from '@/lib/api-response';
import { errorResponse } from '@/lib/errors';
import { authenticateRequest } from '@/lib/api-auth';
import { assertTokenAccess } from '@/services/api-token-service';
import { getChangeSet } from '@/services/changeset-service';
import { revisionToString } from '@/services/snapshot-service';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string; cid: string }> };

/** Read a changeset: status, exact diff, and the revision it was based on. */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const principal = await authenticateRequest(request);
    const { id, cid } = await params;
    await assertTokenAccess(principal, id, 'project:read', ['owner', 'editor', 'viewer']);

    const changeSet = await getChangeSet(id, cid);

    return apiSuccess({
      changeSetId: changeSet.id,
      status: changeSet.status,
      message: changeSet.message,
      baseSnapshotId: changeSet.baseSnapshotId,
      baseRevision: revisionToString(changeSet.baseRevision),
      resultHash: changeSet.resultHash,
      diff: changeSet.diff,
      appliedRevision: changeSet.appliedRevision
        ? revisionToString(changeSet.appliedRevision)
        : null,
      appliedAt: changeSet.appliedAt,
      revertsId: changeSet.revertsId,
      createdAt: changeSet.createdAt,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

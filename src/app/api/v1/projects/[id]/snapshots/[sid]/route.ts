import { NextRequest } from 'next/server';
import { apiSuccess } from '@/lib/api-response';
import { errorResponse } from '@/lib/errors';
import { authenticateRequest } from '@/lib/api-auth';
import { assertTokenAccess } from '@/services/api-token-service';
import { getSnapshot, manifestOf, revisionToString } from '@/services/snapshot-service';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string; sid: string }> };

/** Read a snapshot's manifest. */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const principal = await authenticateRequest(request);
    const { id, sid } = await params;
    await assertTokenAccess(principal, id, 'project:read', ['owner', 'editor', 'viewer']);

    // Scoped by project id, so knowing a snapshot ID from another project does
    // not grant access to it.
    const snapshot = await getSnapshot(id, sid);
    const manifest = manifestOf(snapshot);

    return apiSuccess({
      snapshotId: snapshot.id,
      revision: revisionToString(snapshot.revision),
      inputHash: snapshot.inputHash,
      sourceHash: snapshot.sourceHash,
      buildFingerprint: snapshot.buildFingerprint,
      recoverable: snapshot.sourceHash !== null,
      mainFile: snapshot.mainFile,
      compiler: snapshot.compiler,
      files: manifest.files.map((f) => ({
        fileId: f.fileId,
        path: f.path,
        sha256: f.sha256,
        sizeBytes: f.sizeBytes,
        isBinary: f.isBinary,
      })),
      createdAt: snapshot.createdAt,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

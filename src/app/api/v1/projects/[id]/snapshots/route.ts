import { NextRequest } from 'next/server';
import { apiSuccess } from '@/lib/api-response';
import { errorResponse } from '@/lib/errors';
import { authenticateRequest } from '@/lib/api-auth';
import { assertTokenAccess } from '@/services/api-token-service';
import { createSnapshot, manifestOf, revisionToString } from '@/services/snapshot-service';
import { enforceRateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';
import { logAuditAction } from '@/services/audit-service';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Create (or reuse) an immutable snapshot of the project's committed state.
 *
 * This is the entry point for an external tool: read a snapshot, reason about
 * it, then submit a changeset against it. Everything downstream references the
 * snapshot ID, so the tool is never reasoning about a moving target.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const principal = await authenticateRequest(request);
    const { id } = await params;
    // Reading is enough to snapshot, so viewers are allowed.
    await assertTokenAccess(principal, id, 'project:read', ['owner', 'editor', 'viewer']);

    const limited = await enforceRateLimit(
      `rate:snapshot:${principal.userId}`,
      RATE_LIMITS.FILE_WRITE,
      'Too many snapshot requests. Please slow down.',
    );
    if (limited) return limited;

    const snapshot = await createSnapshot(id);
    const manifest = manifestOf(snapshot);

    logAuditAction(principal.userId, 'snapshot.created', 'project', id, {
      snapshotId: snapshot.id,
      revision: revisionToString(snapshot.revision),
      viaToken: principal.kind === 'token' ? principal.tokenId : null,
    }).catch(() => {});

    return apiSuccess({
      snapshotId: snapshot.id,
      revision: revisionToString(snapshot.revision),
      inputHash: snapshot.inputHash,
      sourceHash: snapshot.sourceHash,
      buildFingerprint: snapshot.buildFingerprint,
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

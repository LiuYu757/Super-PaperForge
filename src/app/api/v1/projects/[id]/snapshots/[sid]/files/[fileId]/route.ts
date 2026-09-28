import { NextRequest } from 'next/server';
import { apiSuccess } from '@/lib/api-response';
import { errorResponse } from '@/lib/errors';
import { authenticateRequest } from '@/lib/api-auth';
import { assertTokenAccess } from '@/services/api-token-service';
import { readSnapshotFile } from '@/services/snapshot-service';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string; sid: string; fileId: string }> };

/**
 * Read one file exactly as it stood in a snapshot.
 *
 * Returns 409 if the stored text no longer matches the snapshot's recorded
 * hash, rather than quietly handing back newer content under an older snapshot
 * ID. An AI reasoning about r42 must not be given r45's text.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const principal = await authenticateRequest(request);
    const { id, sid, fileId } = await params;
    await assertTokenAccess(principal, id, 'project:read', ['owner', 'editor', 'viewer']);

    const file = await readSnapshotFile(id, sid, fileId);

    return apiSuccess({
      fileId,
      path: file.path,
      content: file.content,
      // Echoed back as `expectedSha256` when building a changeset.
      sha256: file.sha256,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

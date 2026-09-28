import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { errorResponse } from '@/lib/errors';
import { apiSuccess, apiError, ApiErrors } from '@/lib/api-response';
import { assertProjectRole } from '@/services/project-service';
import { applyDocumentMutations } from '@/services/document-mutation-service';
import { isValidFilePath, RATE_LIMITS } from '@/lib/constants';
import { enforceRateLimit } from '@/lib/rate-limit';
import { logAuditAction } from '@/services/audit-service';

export const dynamic = 'force-dynamic';

/**
 * Atomic rename endpoint (review N02 / PR-A).
 *
 * Replaces the old client flow of "PUT the content at the new path, then
 * DELETE the old path" — a flow whose second step ran even when the first one
 * failed (HTTP error status never rejected the await), which could destroy
 * the only copy of a manuscript. Rename is now a single transaction on the
 * server:
 *
 *   POST /api/v1/projects/{id}/rename
 *   {
 *     "kind": "file" | "prefix",
 *     "from": "sections/intro.tex",     // file path or folder prefix
 *     "to": "sections/01-intro.tex",
 *     "expectedSha256": "…"             // optional strong precondition on the
 *   }                                   // source file's current content
 *
 * The transaction locks the source rows, verifies the optional version
 * precondition, refuses when any destination path is already taken, rewrites
 * `project.mainFile` when it references a renamed path, and bumps
 * `project.revision` exactly once — all-or-nothing. FileIds, content and
 * object-store references are preserved.
 */

function isSha256(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value);
}

/** Folder prefixes may not carry a leading/trailing slash. */
function isValidFolderPath(prefix: string): boolean {
  if (!isValidFilePath(prefix)) return false;
  if (prefix.startsWith('/') || prefix.endsWith('/')) return false;
  return true;
}

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return ApiErrors.unauthorized();
    }
    const userId = (session.user as { id: string }).id;
    const { id } = await params;
    await assertProjectRole(id, userId, ['owner', 'editor']);

    const limited = await enforceRateLimit(
      `rate:file-write:${userId}`,
      RATE_LIMITS.FILE_WRITE,
      'Too many file operations. Please slow down.',
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

    const kind = payload.kind;
    const from = typeof payload.from === 'string' ? payload.from : '';
    const to = typeof payload.to === 'string' ? payload.to : '';
    const expectedSha256 =
      typeof payload.expectedSha256 === 'string' ? payload.expectedSha256 : undefined;

    if (expectedSha256 !== undefined && !isSha256(expectedSha256)) {
      return apiError(
        'expectedSha256 must be a 64-char lowercase hex SHA-256',
        400,
        'INVALID_PRECONDITION',
      );
    }

    if (kind === 'file') {
      if (!isValidFilePath(from) || !isValidFilePath(to)) {
        return apiError('Invalid source or destination path', 400, 'INVALID_PATH');
      }
      const applied = await applyDocumentMutations({
        projectId: id,
        actorId: userId,
        mutations: [{ kind: 'rename', from, to }],
        ...(expectedSha256 !== undefined
          ? { expectedSha256ByPath: { [from]: expectedSha256 } }
          : {}),
      });
      logAuditAction(userId, 'file.renamed', 'project', id, { from, to }).catch(() => {});
      return apiSuccess({
        kind: 'file',
        from,
        to,
        files: applied.files,
        revision: applied.revision.toString(),
      });
    }

    if (kind === 'prefix') {
      if (!isValidFolderPath(from) || !isValidFolderPath(to)) {
        return apiError(
          'Invalid folder path (no leading/trailing slash, no traversal)',
          400,
          'INVALID_PATH',
        );
      }
      const applied = await applyDocumentMutations({
        projectId: id,
        actorId: userId,
        mutations: [{ kind: 'renamePrefix', fromPrefix: from, toPrefix: to }],
      });
      logAuditAction(userId, 'folder.renamed', 'project', id, { from, to }).catch(() => {});
      return apiSuccess({
        kind: 'prefix',
        from,
        to,
        files: applied.files,
        revision: applied.revision.toString(),
      });
    }

    return apiError('kind must be "file" or "prefix"', 400, 'INVALID_KIND');
  } catch (error) {
    return errorResponse(error);
  }
}

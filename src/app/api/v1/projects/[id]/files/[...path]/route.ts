import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { errorResponse } from '@/lib/errors';
import { apiSuccess, apiError, ApiErrors } from '@/lib/api-response';
import { assertProjectRole } from '@/services/project-service';
import { getFileContent, getFileBuffer, sha256Text } from '@/services/file-service';
import { applyDocumentMutations } from '@/services/document-mutation-service';
import { isValidFilePath, LIMITS, RATE_LIMITS } from '@/lib/constants';
import { enforceRateLimit } from '@/lib/rate-limit';
import { logAuditAction } from '@/services/audit-service';
import { recordActivationEvent } from '@/services/activation-service';
import { hashRequestBody } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

/**
 * RFC 9110 conditional-request handling for the file PUT.
 *
 * The version token is the SHA-256 of the file's UTF-8 bytes, returned by GET
 * as `sha256` (and usable as `If-Match`). Writes are conditional because an
 * unconditional whole-file overwrite lets a stale client clobber someone else's
 * newer edit:
 *
 *  - `If-Match: "sha"`   → write only if the current content hashes to `sha`
 *                          (strong comparison; a mismatch is 412)
 *  - `If-Match: *`       → write only if the file already exists
 *  - `If-None-Match: *`  → create only (the file must not exist yet)
 *  - `baseSha256` body   → same as If-Match: "sha" (browser convenience)
 *  - no precondition     → 428 Precondition Required
 *
 * Weak entity-tags (`W/"…"`) and even one with both headers present are
 * rejected with 400: RFC 9110 §13.1.1 demands strong comparison for If-Match,
 * so accepting a weak tag would admit an approximated match and defeat the
 * whole point of the version check. A concrete If-None-Match etag is refused
 * too (its "match any listed" semantics cannot be mapped to an atomic write
 * precondition without a read-modify-write; use If-Match or If-None-Match: *).
 */
function normalizeETag(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed === '*') return '*';
  return trimmed.replace(/^"|"$/g, '');
}

function isSha256(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value);
}

type RouteParams = { params: Promise<{ id: string; path: string[] }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return ApiErrors.unauthorized();
    }
    const userId = (session.user as { id: string }).id;
    const { id, path } = await params;
    await assertProjectRole(id, userId, ['owner', 'editor', 'viewer']);
    const filePath = path.join('/');
    if (!isValidFilePath(filePath)) {
      return apiError('Invalid file path', 400, 'INVALID_PATH');
    }

    // `?raw=1` streams the exact bytes (PR-B): binary downloads must not go
    // through a JSON/UTF-8 round-trip, which silently corrupts them.
    if (request.nextUrl.searchParams.get('raw') === '1') {
      const { buffer, mimeType } = await getFileBuffer(id, filePath);
      const filename = filePath.split('/').pop() ?? 'download';
      return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': mimeType ?? 'application/octet-stream',
          'Content-Length': String(buffer.byteLength),
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
          'Cache-Control': 'no-store',
        },
      });
    }

    const content = await getFileContent(id, filePath);
    // Return the version token alongside the content so the caller can send it
    // back as If-Match (or baseSha256) on write. Without this round-trip a
    // conditional PUT has no way to prove which version it was based on.
    return apiSuccess({ content, sha256: sha256Text(content) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return ApiErrors.unauthorized();
    }
    const userId = (session.user as { id: string }).id;
    const { id, path } = await params;
    await assertProjectRole(id, userId, ['owner', 'editor']);

    const limited = await enforceRateLimit(
      `rate:file-write:${userId}`,
      RATE_LIMITS.FILE_WRITE,
      'Too many file operations. Please slow down.',
    );
    if (limited) return limited;

    const filePath = path.join('/');
    if (!isValidFilePath(filePath)) {
      return apiError('Invalid file path', 400, 'INVALID_PATH');
    }

    if (/\bW\//i.test(request.headers.get('if-match') ?? '')) {
      return apiError(
        'Weak entity-tags (W/"…") are not accepted in If-Match. Send the strong ETag returned by GET.',
        400,
        'INVALID_PRECONDITION',
      );
    }
    if (/\bW\//i.test(request.headers.get('if-none-match') ?? '')) {
      return apiError(
        'Weak entity-tags (W/"…") are not accepted in If-None-Match. Send If-None-Match: * to create a new file.',
        400,
        'INVALID_PRECONDITION',
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError('Request body must be valid JSON', 400, 'INVALID_BODY');
    }

    // Strict payload validation.
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return apiError('Request body must be a JSON object', 400, 'INVALID_BODY');
    }
    const payload = body as Record<string, unknown>;
    if (!('content' in payload)) {
      return apiError(
        'Missing required field: content. To empty a file, send an explicit empty string.',
        400,
        'MISSING_CONTENT',
      );
    }
    if (typeof payload.content !== 'string') {
      return apiError(
        `Field "content" must be a string (received ${payload.content === null ? 'null' : typeof payload.content}).`,
        400,
        'INVALID_CONTENT_TYPE',
      );
    }
    const content = payload.content;

    // Enforce the same byte limit used by storage accounting.
    if (Buffer.byteLength(content, 'utf8') > LIMITS.MAX_FILE_SIZE) {
      return apiError(
        `Content too large. Maximum size is ${LIMITS.MAX_FILE_SIZE / (1024 * 1024)}MB`,
        413,
        'CONTENT_TOO_LARGE',
      );
    }

    // Resolve the version precondition into a per-file expected value:
    //   '<sha>' | '*' (must exist) | null (must not exist).
    const ifMatch = normalizeETag(request.headers.get('if-match'));
    const ifNoneMatch = normalizeETag(request.headers.get('if-none-match'));
    const baseSha256 =
      typeof payload.baseSha256 === 'string' ? payload.baseSha256 : undefined;

    if (ifMatch && ifNoneMatch) {
      return apiError(
        'Sending both If-Match and If-None-Match is ambiguous; send one.',
        400,
        'AMBIGUOUS_PRECONDITION',
      );
    }

    let expected: string | null | undefined;
    if (ifMatch !== undefined) {
      if (ifMatch !== '*' && !isSha256(ifMatch)) {
        return apiError('If-Match must be a SHA-256 "etag" or *', 400, 'INVALID_PRECONDITION');
      }
      expected = ifMatch;
    } else if (ifNoneMatch !== undefined) {
      if (ifNoneMatch !== '*') {
        return apiError(
          'If-None-Match with a specific etag is not supported; use If-None-Match: * to create a new file.',
          400,
          'INVALID_PRECONDITION',
        );
      }
      // If-None-Match: * → create only (the file must not exist yet).
      expected = null;
    } else if (baseSha256 !== undefined) {
      if (!isSha256(baseSha256)) {
        return apiError('baseSha256 must be a 64-char lowercase hex SHA-256', 400, 'INVALID_PRECONDITION');
      }
      expected = baseSha256;
    }

    if (expected === undefined) {
      return apiError(
        'Missing version precondition. Send If-Match (or baseSha256) with the SHA-256 '
          + 'returned when the file was read. Use If-Match: * to require existence, '
          + 'If-None-Match: * to create a new file.',
        428,
        'PRECONDITION_REQUIRED',
      );
    }

    // The conditional check and the write run inside one transaction with the
    // file row locked, so two concurrent PUTs based on the same version cannot
    // both succeed: the loser observes the winner's committed bytes and 412s.
    const applied = await applyDocumentMutations({
      projectId: id,
      actorId: userId,
      mutations: [{ kind: 'upsertText', path: filePath, content }],
      expectedSha256ByPath: { [filePath]: expected },
      idempotency: request.headers.get('idempotency-key')
        ? { principal: `user:${userId}`, operation: 'file.put',
          idempotencyKey: request.headers.get('idempotency-key')!,
          requestHash: hashRequestBody({ path: filePath, content, expected }) }
        : undefined,
    });

    if (!applied.replayed) {
      logAuditAction(userId, 'file.updated', 'project', id, { path: filePath }).catch(() => {});
      recordActivationEvent(userId, 'added_content').catch(() => {});
    }

    return apiSuccess({
      id: applied.files[0]?.id,
      path: filePath,
      content,
      sha256: applied.files[0]?.sha256,
      revision: applied.revision.toString(),
      replayed: applied.replayed,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return ApiErrors.unauthorized();
    }
    const userId = (session.user as { id: string }).id;
    const { id, path } = await params;

    const limited = await enforceRateLimit(
      `rate:file-write:${userId}`,
      RATE_LIMITS.FILE_WRITE,
      'Too many file operations. Please slow down.',
    );
    if (limited) return limited;

    await assertProjectRole(id, userId, ['owner', 'editor']);

    const filePath = path.join('/');
    if (!isValidFilePath(filePath)) {
      return apiError('Invalid file path', 400, 'INVALID_PATH');
    }

    // Deletes may be conditional too: If-Match "<sha>" refuses to delete a file
    // that has changed since it was read. Default is "must exist".
    const ifMatch = normalizeETag(request.headers.get('if-match'));
    if (ifMatch && ifMatch !== '*' && !isSha256(ifMatch)) {
      return apiError('If-Match must be a SHA-256 "etag" or *', 400, 'INVALID_PRECONDITION');
    }
    const expected = ifMatch && ifMatch !== '*' ? ifMatch : '*';

    const applied = await applyDocumentMutations({
      projectId: id,
      actorId: userId,
      mutations: [{ kind: 'delete', path: filePath }],
      expectedSha256ByPath: { [filePath]: expected },
      idempotency: request.headers.get('idempotency-key')
        ? { principal: `user:${userId}`, operation: 'file.delete',
          idempotencyKey: request.headers.get('idempotency-key')!,
          requestHash: hashRequestBody({ path: filePath, expected }) }
        : undefined,
    });

    if (!applied.replayed) {
      logAuditAction(userId, 'file.deleted', 'project', id, { path: filePath }).catch(() => {});
    }

    return apiSuccess({ message: 'Deleted', replayed: applied.replayed });
  } catch (error) {
    return errorResponse(error);
  }
}

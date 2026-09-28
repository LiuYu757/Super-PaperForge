import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { errorResponse } from '@/lib/errors';
import { assertProjectRole } from '@/services/project-service';
import { uploadBinaryFile } from '@/services/file-service';
import { isValidFilePath, RATE_LIMITS } from '@/lib/constants';
import { apiSuccess, apiError, ApiErrors } from '@/lib/api-response';
import { BLOCKED_EXTENSIONS, MAX_FILE_SIZE } from '@/lib/validation';
import { enforceRateLimit } from '@/lib/rate-limit';
import { logAuditAction } from '@/services/audit-service';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user) return ApiErrors.unauthorized();
    const userId = (session.user as { id: string }).id;
    const { id } = await params;
    await assertProjectRole(id, userId, ['owner', 'editor']);

    const limited = await enforceRateLimit(
      `rate:upload:${userId}`,
      RATE_LIMITS.FILE_UPLOAD,
      'Too many file uploads. Please wait a moment and try again.',
    );
    if (limited) return limited;

    const formData = await request.formData();
    const uploaded = formData.get('file');
    if (!uploaded || !(uploaded instanceof File)) {
      return apiError('No file provided', 400, 'MISSING_FILE');
    }

    let filePath =
      (formData.get('path') as string | null) || uploaded.name;
    const mimeType = uploaded.type || 'application/octet-stream';

    // Decode any URL-encoded characters before validation to prevent double-encoding bypass
    try { filePath = decodeURIComponent(filePath); } catch { /* keep as-is */ }

    // Normalize backslashes to forward slashes (Windows path compat)
    filePath = filePath.replace(/\\/g, '/');

    // Validate file path (prevent directory traversal)
    if (!isValidFilePath(filePath)) {
      return apiError('Invalid file path', 400, 'INVALID_PATH');
    }

    // Validate file size
    if (uploaded.size > MAX_FILE_SIZE) {
      return apiError(
        `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
        413,
        'FILE_TOO_LARGE',
      );
    }

    // Validate file extensions — check ALL extensions to prevent double-extension bypass
    // (e.g. "malware.exe.tex" or "exploit.ps1." should still be blocked)
    const fileName = filePath.split('/').pop() ?? filePath;
    const dotParts = fileName.split('.').slice(1); // all segments after the first dot
    for (const part of dotParts) {
      const normalised = `.${part.toLowerCase()}`;
      if (BLOCKED_EXTENSIONS.has(normalised)) {
        return apiError(
          `File type ${normalised} is not allowed`,
          415,
          'BLOCKED_FILE_TYPE',
        );
      }
    }

    const arrayBuffer = await uploaded.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const file = await uploadBinaryFile(id, filePath, buffer, mimeType, userId);

    logAuditAction(userId, 'file.uploaded', 'project', id, {
      path: filePath,
      size: Number(file.sizeBytes),
      mimeType,
    }).catch(() => {});
    return apiSuccess({ file }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

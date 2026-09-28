import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { errorResponse } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, ApiErrors } from '@/lib/api-response';
import { enforceRateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';
import { logAuditAction } from '@/services/audit-service';

export const dynamic = 'force-dynamic';

const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_AVATAR_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
]);

const profileSelect = {
  id: true,
  name: true,
  email: true,
  institution: true,
  bio: true,
  avatarUrl: true,
  settings: true,
  storageUsedBytes: true,
  storageQuotaBytes: true,
  role: true,
  createdAt: true,
} as const;

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return ApiErrors.unauthorized();
    const userId = (session.user as { id: string }).id;

    const limited = await enforceRateLimit(
      `rate:avatar:${userId}`,
      RATE_LIMITS.AVATAR_UPLOAD,
    );
    if (limited) return limited;

    const formData = await request.formData();
    const uploaded = formData.get('avatar');
    if (!uploaded || !(uploaded instanceof File)) {
      return apiError('No file provided', 400, 'MISSING_FILE');
    }

    if (uploaded.size > MAX_AVATAR_SIZE) {
      return apiError(
        `Avatar too large. Maximum size is ${MAX_AVATAR_SIZE / (1024 * 1024)}MB`,
        413,
        'FILE_TOO_LARGE',
      );
    }

    const mimeType = (uploaded.type || '').toLowerCase();
    if (!ALLOWED_AVATAR_TYPES.has(mimeType)) {
      return apiError(
        'Avatar must be a PNG, JPEG, GIF, or WebP image',
        415,
        'UNSUPPORTED_MEDIA_TYPE',
      );
    }

    const arrayBuffer = await uploaded.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Sanity check magic bytes to prevent disguised payloads
    if (!isValidImageMagic(buffer, mimeType)) {
      return apiError(
        'File contents do not match the declared image type',
        400,
        'INVALID_IMAGE',
      );
    }

    const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: dataUrl },
      select: profileSelect,
    });

    logAuditAction(userId, 'avatar.uploaded', 'user', userId).catch(() => {});

    return apiSuccess(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  try {
    const session = await auth();
    if (!session?.user) return ApiErrors.unauthorized();
    const userId = (session.user as { id: string }).id;

    const limited = await enforceRateLimit(
      `rate:avatar:${userId}`,
      RATE_LIMITS.AVATAR_UPLOAD,
      'Too many avatar updates. Please wait before trying again.',
    );
    if (limited) return limited;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
      select: profileSelect,
    });

    logAuditAction(userId, 'avatar.deleted', 'user', userId).catch(() => {});

    return apiSuccess(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

function isValidImageMagic(buf: Buffer, mimeType: string): boolean {
  if (buf.length < 12) return false;
  switch (mimeType) {
    case 'image/png':
      return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    case 'image/jpeg':
    case 'image/jpg':
      return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case 'image/gif':
      return (
        buf[0] === 0x47 &&
        buf[1] === 0x49 &&
        buf[2] === 0x46 &&
        buf[3] === 0x38 &&
        (buf[4] === 0x37 || buf[4] === 0x39) &&
        buf[5] === 0x61
      );
    case 'image/webp':
      return (
        buf[0] === 0x52 &&
        buf[1] === 0x49 &&
        buf[2] === 0x46 &&
        buf[3] === 0x46 &&
        buf[8] === 0x57 &&
        buf[9] === 0x45 &&
        buf[10] === 0x42 &&
        buf[11] === 0x50
      );
    default:
      return false;
  }
}

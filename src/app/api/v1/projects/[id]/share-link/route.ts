import { NextRequest } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { apiSuccess, ApiErrors } from '@/lib/api-response';
import { errorResponse } from '@/lib/errors';
import { createShareLink, listShareLinks } from '@/services/member-service';
import { enforceRateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';
import { logAuditAction } from '@/services/audit-service';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

const createShareLinkSchema = z.object({
  permission: z.enum(['editor', 'viewer']),
  expiresAt: z.string().datetime().optional(),
});

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return ApiErrors.unauthorized();
    }
    const userId = (session.user as { id: string }).id;
    const { id } = await params;
    const links = await listShareLinks(id, userId);
    return apiSuccess(links);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return ApiErrors.unauthorized();
    }
    const userId = (session.user as { id: string }).id;

    const limited = await enforceRateLimit(
      `rate:share-link:${userId}`,
      RATE_LIMITS.SHARE_LINK,
      'You have created too many share links recently. Please wait before creating more.',
    );
    if (limited) return limited;

    const { id } = await params;
    const body = await request.json();
    const { permission, expiresAt } = createShareLinkSchema.parse(body);
    const link = await createShareLink(
      id,
      userId,
      permission,
      expiresAt ? new Date(expiresAt) : undefined,
    );

    logAuditAction(userId, 'share_link.created', 'project', id, { permission, linkId: link.id }).catch(() => {});

    return apiSuccess(link, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

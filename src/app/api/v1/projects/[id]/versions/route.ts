import { NextRequest } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { apiSuccess, ApiErrors } from '@/lib/api-response';
import { errorResponse } from '@/lib/errors';
import { assertProjectRole } from '@/services/project-service';
import { createVersion, listVersions } from '@/services/version-service';
import { enforceRateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';
import { logAuditAction } from '@/services/audit-service';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

const createVersionSchema = z.object({
  label: z.string().min(1).max(255).optional(),
});

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return ApiErrors.unauthorized();
    }
    const userId = (session.user as { id: string }).id;
    const { id } = await params;

    // Any project member can view versions
    await assertProjectRole(id, userId, ['owner', 'editor', 'viewer']);

    const versions = await listVersions(id);
    return apiSuccess(versions);
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
    const { id } = await params;

    const limited = await enforceRateLimit(`rate:version-create:${userId}`, RATE_LIMITS.VERSION_CREATE);
    if (limited) return limited;

    // Only owners and editors can create versions
    await assertProjectRole(id, userId, ['owner', 'editor']);

    const body = await request.json();
    const { label } = createVersionSchema.parse(body);

    const version = await createVersion(id, userId, label);

    logAuditAction(userId, 'version.created', 'project', id, { versionId: version.id, label }).catch(() => {});

    return apiSuccess(version, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

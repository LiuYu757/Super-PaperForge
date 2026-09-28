import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { apiSuccess, ApiErrors } from '@/lib/api-response';
import { errorResponse } from '@/lib/errors';
import { assertProjectRole } from '@/services/project-service';
import { getVersionDiff } from '@/services/version-service';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string; versionId: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return ApiErrors.unauthorized();
    }
    const userId = (session.user as { id: string }).id;
    const { id, versionId } = await params;

    await assertProjectRole(id, userId, ['owner', 'editor', 'viewer']);

    const diff = await getVersionDiff(id, versionId);
    return apiSuccess(diff);
  } catch (error) {
    return errorResponse(error);
  }
}

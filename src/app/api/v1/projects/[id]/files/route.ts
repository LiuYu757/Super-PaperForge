import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { errorResponse } from '@/lib/errors';
import { assertProjectRole } from '@/services/project-service';
import { listFiles } from '@/services/file-service';
import { apiSuccess, ApiErrors } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user) return ApiErrors.unauthorized();
    const userId = (session.user as { id: string }).id;
    const { id } = await params;
    await assertProjectRole(id, userId, ['owner', 'editor', 'viewer']);
    const files = await listFiles(id);
    return apiSuccess(files);
  } catch (error) {
    return errorResponse(error);
  }
}

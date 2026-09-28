import { NextRequest } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { getCompilationStatus } from '@/services/compilation-service';
import { apiSuccess, ApiErrors } from '@/lib/api-response';
import { authenticateRequest } from '@/lib/api-auth';
import { assertTokenAccess } from '@/services/api-token-service';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; compileId: string }> },
) {
  try {
    const principal = await authenticateRequest(request);
    const { id, compileId } = await params;

    await assertTokenAccess(principal, id, 'artifact:read', ['owner', 'editor', 'viewer']);

    const compilation = await getCompilationStatus(compileId, id);
    if (!compilation) return ApiErrors.notFound('Compilation');

    return apiSuccess(compilation);
  } catch (error) {
    return errorResponse(error);
  }
}

import { NextRequest } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { apiSuccess } from '@/lib/api-response';
import { authenticateRequest } from '@/lib/api-auth';
import { assertTokenAccess } from '@/services/api-token-service';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const principal = await authenticateRequest(request);
    const { id } = await params;

    await assertTokenAccess(principal, id, 'artifact:read', ['owner', 'editor', 'viewer']);

    const { searchParams } = new URL(request.url);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '10', 10) || 10));

    const compilations = await prisma.compilation.findMany({
      where: { projectId: id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        status: true,
        compiler: true,
        sourceHash: true,
        durationMs: true,
        createdAt: true,
      },
    });

    return apiSuccess(compilations);
  } catch (error) {
    return errorResponse(error);
  }
}

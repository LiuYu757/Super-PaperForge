import { auth } from '@/lib/auth';
import { errorResponse } from '@/lib/errors';
import { ApiErrors, apiSuccess } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { RATE_LIMITS } from '@/lib/constants';
import { enforceRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    const userRole = (session?.user as { role?: string } | undefined)?.role;
    if (!session?.user || userRole !== 'admin') {
      return ApiErrors.forbidden();
    }
    const adminId = (session.user as { id: string }).id;

    const limited = await enforceRateLimit(`rate:admin-list:${adminId}`, RATE_LIMITS.ADMIN_LIST);
    if (limited) return limited;

    const templates = await prisma.template.findMany({
      where: { isApproved: false },
      include: {
        author: { select: { id: true, name: true, email: true } },
        sourceProject: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return apiSuccess(templates);
  } catch (error) {
    return errorResponse(error);
  }
}

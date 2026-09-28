import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { errorResponse } from '@/lib/errors';
import { apiSuccess, ApiErrors } from '@/lib/api-response';
import { enforceRateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/admin/analytics
 * Detailed platform analytics for admin dashboard.
 */
export async function GET() {
  try {
    const session = await auth();
    const userRole = (session?.user as { role?: string } | undefined)?.role;
    if (!session?.user || userRole !== 'admin') return ApiErrors.forbidden();
    const adminId = (session.user as { id: string }).id;

    const limited = await enforceRateLimit(`rate:admin-list:${adminId}`, RATE_LIMITS.ADMIN_LIST);
    if (limited) return limited;

    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const [
      totalUsers,
      newUsersToday,
      newUsersWeek,
      totalProjects,
      activeProjectsWeek,
      totalCompilations,
      compilationsToday,
      compilationsWeek,
      successRate,
      totalFiles,
      totalTemplates,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: dayAgo } } }),
      prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.project.count({ where: { deletedAt: null } }),
      prisma.project.count({ where: { deletedAt: null, updatedAt: { gte: weekAgo } } }),
      prisma.compilation.count(),
      prisma.compilation.count({ where: { createdAt: { gte: dayAgo } } }),
      prisma.compilation.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.compilation.count({ where: { status: 'success' } }),
      prisma.file.count({ where: { deletedAt: null } }),
      prisma.template.count({ where: { isApproved: true } }),
    ]);

    const compilationSuccessRate = totalCompilations > 0
      ? Math.round((successRate / totalCompilations) * 100)
      : 0;

    return apiSuccess({
      users: {
        total: totalUsers,
        newToday: newUsersToday,
        newThisWeek: newUsersWeek,
      },
      projects: {
        total: totalProjects,
        activeThisWeek: activeProjectsWeek,
      },
      compilations: {
        total: totalCompilations,
        today: compilationsToday,
        thisWeek: compilationsWeek,
        successRate: compilationSuccessRate,
      },
      content: {
        totalFiles,
        totalTemplates,
      },
      generatedAt: now.toISOString(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

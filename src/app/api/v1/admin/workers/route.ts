import { auth } from '@/lib/auth';
import { errorResponse } from '@/lib/errors';
import { ApiErrors, apiSuccess } from '@/lib/api-response';
import { enforceRateLimit } from '@/lib/rate-limit';
import { redis } from '@/lib/redis';
import { RATE_LIMITS } from '@/lib/constants';

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

    // Get queue info from Redis (if available)
    let waiting = 0, active = 0, completed = 0, failed = 0;
    if (redis) {
      [waiting, active, completed, failed] = await Promise.all([
        redis.llen('bull:compilation:wait'),
        redis.llen('bull:compilation:active'),
        redis.llen('bull:compilation:completed'),
        redis.llen('bull:compilation:failed'),
      ]);
    }

    return apiSuccess({
      queue: {
        name: 'compilation',
        waiting,
        active,
        completed,
        failed,
      },
      workers: [
        {
          id: 'worker-1',
          status: 'running',
          note: 'Compilation worker (placeholder)',
        },
      ],
    });
  } catch (error) {
    return errorResponse(error);
  }
}

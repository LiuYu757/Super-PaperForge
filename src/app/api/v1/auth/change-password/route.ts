import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { errorResponse, ApiError } from '@/lib/errors';
import { apiSuccess, ApiErrors } from '@/lib/api-response';
import { enforceRateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';
import { logAuditAction } from '@/services/audit-service';

export const dynamic = 'force-dynamic';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain uppercase letter')
    .regex(/[a-z]/, 'Must contain lowercase letter')
    .regex(/[0-9]/, 'Must contain digit'),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return ApiErrors.unauthorized();
    const userId = (session.user as { id: string }).id;

    const limited = await enforceRateLimit(`rate:change-pw:${userId}`, RATE_LIMITS.CHANGE_PASSWORD);
    if (limited) return limited;

    const body = await request.json();
    const { currentPassword, newPassword } = changePasswordSchema.parse(body);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, email: true },
    });

    if (!user?.passwordHash) {
      throw new ApiError(400, 'Account uses OAuth login — password cannot be changed');
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new ApiError(400, 'Current password is incorrect');
    }

    if (currentPassword === newPassword) {
      throw new ApiError(400, 'New password must be different from current password');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });

    logAuditAction(userId, 'change_password', 'user', userId, undefined, user.email).catch(() => {});

    return apiSuccess({ message: 'Password changed successfully.' });
  } catch (error) {
    return errorResponse(error);
  }
}

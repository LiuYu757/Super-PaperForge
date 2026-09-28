import { headers } from 'next/headers';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { verifySignedToken } from '@/lib/jwt-utils';
import { prisma } from '@/lib/prisma';
import { errorResponse, ApiError } from '@/lib/errors';
import { checkRateLimit, getClientIp, rateLimitHeaders } from '@/lib/rate-limit';
import { apiError, apiSuccess } from '@/lib/api-response';
import { RATE_LIMITS } from '@/lib/constants';
import { logAuditAction } from '@/services/audit-service';

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/, 'Must contain uppercase letter')
    .regex(/[a-z]/, 'Must contain lowercase letter')
    .regex(/[0-9]/, 'Must contain digit'),
});

export async function POST(request: Request) {
  try {
    // Rate limit: 5 per 15 minutes per IP
    const headersList = await headers();
    const ip = getClientIp(headersList as unknown as Headers);
    const rateLimit = await checkRateLimit(`rate:reset-pw:${ip}`, RATE_LIMITS.RESET_PASSWORD.limit, RATE_LIMITS.RESET_PASSWORD.windowSeconds);
    if (!rateLimit.allowed) {
      return apiError('Too many attempts. Please try again later.', 429, 'RATE_LIMITED', {
        ...rateLimitHeaders(RATE_LIMITS.RESET_PASSWORD.limit, rateLimit),
      });
    }

    const body = await request.json();
    const { token, password } = resetPasswordSchema.parse(body);

    const payload = verifySignedToken(token);

    if (payload.purpose !== 'password-reset') {
      throw new ApiError(400, 'Invalid token purpose');
    }

    const userId = payload.sub as string;
    if (!userId) {
      throw new ApiError(400, 'Invalid token');
    }

    // Single-use check: if password was changed after token was issued, reject
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { updatedAt: true, email: true },
    });
    if (!user) throw new ApiError(404, 'User not found');
    const iat = typeof payload.iat === 'number' ? payload.iat : 0;
    const tokenIssuedAt = new Date(iat * 1000);
    if (user.updatedAt > tokenIssuedAt) {
      throw new ApiError(400, 'This reset link has already been used or has expired');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
        tokenVersion: { increment: 1 },
      },
    });

    logAuditAction(userId, 'reset_password', 'user', userId, undefined, user.email).catch(() => {});

    return apiSuccess({
      message: 'Password has been reset successfully.',
    });
  } catch (error) {
    return errorResponse(error);
  }
}

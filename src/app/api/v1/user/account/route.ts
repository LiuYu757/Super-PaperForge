import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ApiError, errorResponse } from '@/lib/errors';
import { apiSuccess, ApiErrors } from '@/lib/api-response';
import { enforceRateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const deleteAccountSchema = z.object({
  confirmation: z.literal('DELETE'),
  currentPassword: z.string().optional(),
});

/**
 * DELETE /api/v1/user/account
 * Permanently destroys the user record and everything they own.
 */
export async function DELETE(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return ApiErrors.unauthorized();
    const userId = (session.user as { id: string }).id;
    const body = await request.json().catch(() => ({}));
    const { currentPassword } = deleteAccountSchema.parse(body);

    const limited = await enforceRateLimit(
      `rate:delete-account:${userId}`,
      RATE_LIMITS.ACCOUNT_DELETE,
      'Account deletion has been requested too many times. Please contact support if you are stuck.',
    );
    if (limited) return limited;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, email: true },
    });
    if (!user) return ApiErrors.unauthorized();

    const sharedMembership = await prisma.projectMember.findFirst({
      where: {
        project: { createdBy: userId },
        userId: { not: userId },
      },
      select: { projectId: true },
    });
    if (sharedMembership) {
      throw new ApiError(
        409,
        'Transfer project ownership before deleting your account because this account owns a project with collaborators.',
      );
    }

    if (user.passwordHash) {
      if (!currentPassword) {
        throw new ApiError(400, 'Current password is required to delete this account');
      }
      const validPassword = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!validPassword) {
        throw new ApiError(400, 'Current password is incorrect');
      }
    }

    // Wrap every deletion in a single transaction so a mid-way failure (timeout,
    // FK conflict, dropped connection) cannot strand the account half-deleted,
    // a state with no UI to recover from. Bumped timeout from the 5s default
    // because heavy users can own thousands of files / compilations.
    await prisma.$transaction(
      async (tx) => {
        // Log deletion first. When the user row is removed below, ON DELETE SET NULL
        // nulls out adminId on this entry while actorEmail preserves traceability.
        await tx.auditLog.create({
          data: { adminId: userId, actorEmail: user.email, action: 'delete_account', targetType: 'user', targetId: userId },
        });

        await tx.gitCredential.deleteMany({ where: { userId } });
        await tx.projectMember.deleteMany({ where: { userId } });

        const ownedProjects = await tx.project.findMany({
          where: { createdBy: userId },
          select: { id: true },
        });
        if (ownedProjects.length > 0) {
          const projectIds = ownedProjects.map((p) => p.id);
          await tx.file.deleteMany({ where: { projectId: { in: projectIds } } });
          await tx.version.deleteMany({ where: { projectId: { in: projectIds } } });
          await tx.compilation.deleteMany({ where: { projectId: { in: projectIds } } });
          await tx.projectMember.deleteMany({ where: { projectId: { in: projectIds } } });
          await tx.project.deleteMany({ where: { createdBy: userId } });
        }

        await tx.template.deleteMany({ where: { authorId: userId } });
        await tx.user.delete({ where: { id: userId } });
      },
      { timeout: 30_000 },
    );

    return apiSuccess({ message: 'Account deleted successfully.' });
  } catch (error) {
    return errorResponse(error);
  }
}

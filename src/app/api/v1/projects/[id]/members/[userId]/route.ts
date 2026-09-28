import { NextRequest } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { apiSuccess, ApiErrors } from '@/lib/api-response';
import { errorResponse } from '@/lib/errors';
import { updateMemberRole, removeMember } from '@/services/member-service';
import { enforceRateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';
import { logAuditAction } from '@/services/audit-service';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string; userId: string }> };

const updateRoleSchema = z.object({
  role: z.enum(['editor', 'viewer']),
});

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return ApiErrors.unauthorized();
    }
    const requesterId = (session.user as { id: string }).id;
    const { id, userId } = await params;

    const limited = await enforceRateLimit(`rate:member-op:${requesterId}`, RATE_LIMITS.PROJECT_MEMBER_OP);
    if (limited) return limited;

    const body = await request.json();
    const { role } = updateRoleSchema.parse(body);
    const member = await updateMemberRole(id, requesterId, userId, role);

    logAuditAction(requesterId, 'member.role_changed', 'project', id, { targetUserId: userId, role }).catch(() => {});

    return apiSuccess(member);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return ApiErrors.unauthorized();
    }
    const requesterId = (session.user as { id: string }).id;
    const { id, userId } = await params;

    const limited = await enforceRateLimit(`rate:member-op:${requesterId}`, RATE_LIMITS.PROJECT_MEMBER_OP);
    if (limited) return limited;

    await removeMember(id, requesterId, userId);

    logAuditAction(requesterId, 'member.removed', 'project', id, { targetUserId: userId }).catch(() => {});

    return apiSuccess({ removed: true });
  } catch (error) {
    return errorResponse(error);
  }
}

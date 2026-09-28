import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { apiSuccess, ApiErrors } from '@/lib/api-response';
import { errorResponse } from '@/lib/errors';
import { createProjectFromTemplate } from '@/services/template-service';
import { enforceRateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';
import { logAuditAction } from '@/services/audit-service';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const schema = z.object({
  projectName: z.string().min(1).max(255),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return ApiErrors.unauthorized();
    }
    const userId = (session.user as { id: string }).id;
    const { templateId } = await params;

    const limited = await enforceRateLimit(
      `rate:create-project:${userId}`,
      RATE_LIMITS.PROJECT_CREATE,
    );
    if (limited) return limited;

    const body = await request.json();
    const { projectName } = schema.parse(body);
    const project = await createProjectFromTemplate(templateId, userId, projectName);

    logAuditAction(userId, 'project.created_from_template', 'project', project.id, { templateId, projectName }).catch(() => {});

    return apiSuccess(project, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

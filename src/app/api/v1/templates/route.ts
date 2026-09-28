import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { errorResponse } from '@/lib/errors';
import {
  listTemplates,
  submitTemplate,
  TEMPLATE_LIST_DEFAULT_LIMIT,
  TEMPLATE_LIST_MAX_LIMIT,
} from '@/services/template-service';
import { z } from 'zod';
import { apiSuccess, ApiErrors } from '@/lib/api-response';
import { enforceRateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';
import { logAuditAction } from '@/services/audit-service';

export const dynamic = 'force-dynamic';

const submitTemplateSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional().default(''),
  category: z.string().min(1),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') ?? undefined;
    const search = searchParams.get('search') ?? undefined;
    const rawLimit = Number(searchParams.get('limit')) || TEMPLATE_LIST_DEFAULT_LIMIT;
    const rawOffset = Number(searchParams.get('offset')) || 0;
    const { items, total, limit, offset } = await listTemplates(
      category,
      search,
      Math.min(rawLimit, TEMPLATE_LIST_MAX_LIMIT),
      rawOffset,
    );
    // Keep the array shape clients already depend on (data: Template[]) but
    // surface pagination through standard headers so a future infinite-scroll
    // UI has access to it without breaking existing consumers.
    const res = apiSuccess(items);
    res.headers.set('X-Total-Count', String(total));
    res.headers.set('X-Page-Limit', String(limit));
    res.headers.set('X-Page-Offset', String(offset));
    return res;
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return ApiErrors.unauthorized();
    const userId = (session.user as { id: string }).id;

    const limited = await enforceRateLimit(`rate:template-submit:${userId}`, RATE_LIMITS.TEMPLATE_SUBMIT);
    if (limited) return limited;

    const body = await request.json();
    const data = submitTemplateSchema.parse(body);
    const template = await submitTemplate(
      data.projectId,
      userId,
      data.name,
      data.description,
      data.category,
    );

    logAuditAction(userId, 'template.submitted', 'template', template.id, { name: data.name, category: data.category }).catch(() => {});

    return apiSuccess(template, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

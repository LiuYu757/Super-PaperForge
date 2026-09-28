import { NextRequest } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit';
import { triggerCompilation } from '@/services/compilation-service';
import { apiSuccess, apiError } from '@/lib/api-response';
import { RATE_LIMITS } from '@/lib/constants';
import { authenticateRequest, hashRequestBody, principalKey } from '@/lib/api-auth';
import { assertTokenAccess } from '@/services/api-token-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const principal = await authenticateRequest(request);
    const userId = principal.userId;
    const { id } = await params;

    await assertTokenAccess(principal, id, 'compile:run', ['owner', 'editor']);

    // Rate limit: 10 compilations per minute per user per project
    const rateLimitKey = `rate:compile:${userId}:${id}`;
    const rateLimit = await checkRateLimit(rateLimitKey, RATE_LIMITS.COMPILATION.limit, RATE_LIMITS.COMPILATION.windowSeconds);
    if (!rateLimit.allowed) {
      const res = apiError('Too many compilation requests. Please wait before retrying.', 429, 'RATE_LIMITED');
      Object.entries(rateLimitHeaders(RATE_LIMITS.COMPILATION.limit, rateLimit)).forEach(([k, v]) => res.headers.set(k, v));
      return res;
    }

    let changeSetId: string | undefined;
    let snapshotId: string | undefined;
    const raw = await request.text();
    if (raw.trim()) {
      let payload: unknown;
      try { payload = JSON.parse(raw); } catch {
        return apiError('Request body must be valid JSON', 400, 'INVALID_BODY');
      }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return apiError('Request body must be an object', 400, 'INVALID_BODY');
      }
      const candidate = (payload as Record<string, unknown>).changeSetId;
      const snapshot = (payload as Record<string, unknown>).snapshotId;
      if (candidate !== undefined && typeof candidate !== 'string') {
        return apiError('changeSetId must be a string', 400, 'INVALID_BODY');
      }
      if (snapshot !== undefined && typeof snapshot !== 'string') {
        return apiError('snapshotId must be a string', 400, 'INVALID_BODY');
      }
      changeSetId = candidate as string | undefined;
      snapshotId = snapshot as string | undefined;
      if (changeSetId && snapshotId) {
        return apiError('Choose either changeSetId or snapshotId', 400, 'AMBIGUOUS_COMPILE_SOURCE');
      }
    }
    const key = request.headers.get('idempotency-key');
    const compilation = await triggerCompilation(id, userId, changeSetId,
      key ? { principal: principalKey(principal), operation: 'compile.trigger',
        idempotencyKey: key, requestHash: hashRequestBody({ changeSetId: changeSetId ?? null,
          snapshotId: snapshotId ?? null }) }
        : undefined, snapshotId);

    const res = apiSuccess(compilation, 202);
    Object.entries(rateLimitHeaders(RATE_LIMITS.COMPILATION.limit, rateLimit)).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  } catch (error) {
    return errorResponse(error);
  }
}

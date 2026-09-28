import { NextRequest } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { errorResponse } from '@/lib/errors';
import {
  addGitCredential,
  listGitCredentials,
} from '@/services/git-service';
import { apiSuccess, apiError, ApiErrors } from '@/lib/api-response';
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';
import { logAuditAction } from '@/services/audit-service';

export const dynamic = 'force-dynamic';

const ALLOWED_PROVIDERS = ['github', 'gitlab', 'bitbucket', 'gitea', 'azure-devops'] as const;

const addCredentialSchema = z.object({
  provider: z.enum(ALLOWED_PROVIDERS),
  token: z.string().min(1).max(4096),
});

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return ApiErrors.unauthorized();
    const userId = (session.user as { id: string }).id;
    const credentials = await listGitCredentials(userId);
    return apiSuccess(credentials);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return ApiErrors.unauthorized();
    const userId = (session.user as { id: string }).id;

    const rl = await checkRateLimit(
      `rate:git-cred:${userId}`,
      RATE_LIMITS.GIT_CREDENTIAL_ADD.limit,
      RATE_LIMITS.GIT_CREDENTIAL_ADD.windowSeconds,
    );
    if (!rl.allowed) {
      return apiError('Too many credential operations. Please try again later.', 429, 'RATE_LIMITED', {
        ...rateLimitHeaders(RATE_LIMITS.GIT_CREDENTIAL_ADD.limit, rl),
      });
    }

    const body = await request.json();
    const { provider, token } = addCredentialSchema.parse(body);
    const credential = await addGitCredential(userId, provider, token);

    logAuditAction(userId, 'git_credential.added', 'git_credential', credential.id, { provider }).catch(() => {});

    return apiSuccess(credential, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

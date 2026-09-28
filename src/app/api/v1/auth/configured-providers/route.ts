import { apiSuccess } from '@/lib/api-response';
import { getEnabledOAuthProviders } from '@/lib/oauth-providers';

export const dynamic = 'force-dynamic';

export async function GET() {
  return apiSuccess({ providers: getEnabledOAuthProviders() });
}

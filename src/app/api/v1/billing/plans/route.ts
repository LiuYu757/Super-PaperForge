import { apiSuccess } from '@/lib/api-response';
import { BILLING_PLAN_LIST } from '@/lib/billing-plans';

export const dynamic = 'force-dynamic';

export async function GET() {
  return apiSuccess({
    plans: BILLING_PLAN_LIST,
    defaultCadence: 'monthly',
  });
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CheckCircle2Icon } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { cn } from '@/lib/utils';
import { resolveBillingPlanForUser } from '@/lib/billing-plans';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Subscription Confirmed',
  robots: { index: false },
};

/**
 * Post-checkout landing page. The provider redirects here after a successful
 * payment. The plan itself is provisioned asynchronously by the billing
 * webhook, so this page reads the current resolved plan and explains that it
 * may take a moment to reflect if the webhook hasn't landed yet.
 */
export default async function BillingSuccessPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const userId = (session.user as { id: string }).id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { settings: true, storageQuotaBytes: true },
  });
  if (!user) redirect('/login');

  const plan = resolveBillingPlanForUser(user);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 pb-12 pt-6">
      <Card>
        <CardHeader className="items-center text-center">
          <CheckCircle2Icon className="mb-2 size-12 text-emerald-500" aria-hidden />
          <CardTitle className="text-2xl">Thank you — your checkout is complete</CardTitle>
          <CardDescription>
            Your subscription is being activated. Your plan will update automatically once
            payment is confirmed, usually within a few moments.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Current plan</span>
            <Badge variant="secondary">{plan.name}</Badge>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/projects" className={buttonVariants({ size: 'lg' })}>
              Go to your projects
            </Link>
            <Link
              href="/billing"
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}
            >
              View billing
            </Link>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            If your plan does not update shortly, please contact support — your payment is safe
            and we will reconcile it.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

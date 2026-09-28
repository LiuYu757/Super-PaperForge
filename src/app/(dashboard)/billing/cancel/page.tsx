import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { XCircleIcon } from 'lucide-react';
import { auth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Checkout Canceled',
  robots: { index: false },
};

/**
 * Post-checkout cancel landing page. The provider redirects here when the user
 * abandons checkout. Nothing was charged and no plan change occurred.
 */
export default async function BillingCancelPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 pb-12 pt-6">
      <Card>
        <CardHeader className="items-center text-center">
          <XCircleIcon className="mb-2 size-12 text-muted-foreground" aria-hidden />
          <CardTitle className="text-2xl">Checkout canceled</CardTitle>
          <CardDescription>
            No payment was taken and your plan is unchanged. You can pick up where you left off
            whenever you are ready.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/billing" className={buttonVariants({ size: 'lg' })}>
              Back to billing
            </Link>
            <Link
              href="/pricing"
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}
            >
              Compare plans
            </Link>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Questions about pricing or invoicing? Start a Team inquiry from the billing page and
            our team will help.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import {
  CheckIcon,
  CreditCardIcon,
  GaugeIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatBytes, cn } from '@/lib/utils';
import {
  BILLING_PLAN_LIST,
  formatPlanPrice,
  resolveBillingPlanForUser,
} from '@/lib/billing-plans';
import { CheckoutButton } from '@/components/billing/checkout-button';
import { SalesInquiryForm } from '@/components/billing/sales-inquiry-form';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Billing',
  robots: { index: false },
};

export default async function BillingPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const userId = (session.user as { id: string }).id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      settings: true,
      storageUsedBytes: true,
      storageQuotaBytes: true,
    },
  });
  if (!user) redirect('/login');

  const currentPlan = resolveBillingPlanForUser(user);
  const usedBytes = Number(user.storageUsedBytes ?? 0);
  const quotaBytes = Number(user.storageQuotaBytes ?? currentPlan.storageBytes);
  const usagePercent = quotaBytes > 0 ? Math.min(100, (usedBytes / quotaBytes) * 100) : 0;

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col gap-2">
        <Badge variant="secondary" className="w-fit">
          Billing
        </Badge>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Plan and Billing</h1>
          <p className="text-sm text-muted-foreground">
            Manage the subscription that funds hosted PaperForge storage,
            compilation capacity, support, and operations.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCardIcon className="size-5 text-orange-500" />
              Current Plan
            </CardTitle>
            <CardDescription>
              Your workspace is currently on the {currentPlan.name} plan.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border p-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Account
              </p>
              <p className="mt-2 truncate text-sm font-semibold">{user.email}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Storage
              </p>
              <p className="mt-2 text-sm font-semibold">
                {formatBytes(usedBytes)} / {formatBytes(quotaBytes)}
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-orange-500"
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Compile Queue
              </p>
              <p className="mt-2 text-sm font-semibold capitalize">
                {currentPlan.compilePriority}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheckIcon className="size-5 text-green-600" />
              Operations Promise
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Hosted plans pay for resilient storage, compilation capacity, email delivery, and support coverage.</p>
            <p>Self-hosted deployments can keep running independently under the MIT license.</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {BILLING_PLAN_LIST.map((plan) => {
          const isCurrent = plan.id === currentPlan.id;
          const isDowngrade = plan.id === 'free' && currentPlan.id !== 'free';
          return (
            <Card
              key={plan.id}
              className={cn(
                'relative flex flex-col',
                plan.recommended && 'border-orange-500 ring-1 ring-orange-500/20',
              )}
            >
              {plan.recommended && (
                <Badge className="absolute -top-3 left-4 bg-orange-500 text-white hover:bg-orange-600">
                  Most Popular
                </Badge>
              )}
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{plan.name}</CardTitle>
                    <CardDescription>{plan.audience}</CardDescription>
                  </div>
                  {isCurrent && <Badge variant="secondary">Current</Badge>}
                </div>
                <div className="flex items-baseline gap-1 pt-2">
                  <span className="text-3xl font-bold">{formatPlanPrice(plan)}</span>
                  <span className="text-sm text-muted-foreground">{plan.priceUnit}</span>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-5">
                <ul className="flex-1 space-y-2">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <CheckIcon className="mt-0.5 size-4 shrink-0 text-green-600" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <CheckoutButton
                  planId={plan.id}
                  variant={plan.recommended ? 'default' : 'outline'}
                  disabled={isCurrent || isDowngrade}
                  unauthenticatedHref="/projects"
                  className={cn(
                    'w-full',
                    plan.recommended && 'bg-orange-500 hover:bg-orange-600',
                  )}
                >
                  {isCurrent ? 'Current Plan' : isDowngrade ? 'Included' : plan.cta}
                </CheckoutButton>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GaugeIcon className="size-5 text-orange-500" />
            Commercial Readiness
          </CardTitle>
          <CardDescription>
            These controls mirror the startup operating model for selling the hosted product today.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-lg border p-4">
            <SparklesIcon className="mb-2 size-4 text-orange-500" />
            <p className="font-medium">Plan catalog</p>
            <p className="mt-1 text-muted-foreground">Pricing, limits, support, and upgrade paths are defined once.</p>
          </div>
          <div className="rounded-lg border p-4">
            <CreditCardIcon className="mb-2 size-4 text-orange-500" />
            <p className="font-medium">Checkout handoff</p>
            <p className="mt-1 text-muted-foreground">Hosted checkout URLs can be wired by environment variable.</p>
          </div>
          <div className="rounded-lg border p-4">
            <ShieldCheckIcon className="mb-2 size-4 text-orange-500" />
            <p className="font-medium">Usage guardrails</p>
            <p className="mt-1 text-muted-foreground">Free accounts are limited before operational cost grows unchecked.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team Sales Inquiry</CardTitle>
          <CardDescription>
            Send a procurement-ready request to the PaperForge sales mailbox.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SalesInquiryForm />
        </CardContent>
      </Card>
    </div>
  );
}

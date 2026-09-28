'use client';

import { useState } from 'react';
import type { ComponentProps } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { BillingCadence, PlanId } from '@/lib/billing-plans';

type ButtonProps = ComponentProps<typeof Button>;

interface CheckoutButtonProps extends Omit<ButtonProps, 'onClick'> {
  planId: PlanId;
  cadence?: BillingCadence;
  unauthenticatedHref?: string;
  children: React.ReactNode;
}

export function CheckoutButton({
  planId,
  cadence = 'monthly',
  unauthenticatedHref = `/register?plan=${planId}`,
  children,
  disabled,
  ...props
}: CheckoutButtonProps) {
  const [loading, setLoading] = useState(false);

  async function startCheckout() {
    if (planId === 'free') {
      window.location.assign(unauthenticatedHref);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/v1/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, cadence }),
      });

      if (response.status === 401) {
        window.location.assign(unauthenticatedHref);
        return;
      }

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          typeof body?.error === 'string'
            ? body.error
            : body?.error?.message ?? 'Unable to start checkout';
        throw new Error(message);
      }

      const data = body?.data ?? body;
      if (!data?.checkoutUrl) throw new Error('Checkout URL was not returned');
      window.location.assign(data.checkoutUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to start checkout';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      {...props}
      disabled={disabled || loading}
      onClick={() => {
        void startCheckout();
      }}
    >
      {loading ? 'Opening...' : children}
    </Button>
  );
}

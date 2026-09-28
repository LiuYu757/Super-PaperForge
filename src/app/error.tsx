'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Page error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="flex size-20 items-center justify-center rounded-2xl bg-destructive/10">
        <AlertTriangle className="size-10 text-destructive" aria-hidden="true" />
      </div>
      <div className="text-center" role="alert" aria-live="assertive">
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="mt-2 max-w-md text-muted-foreground">
          An unexpected error occurred. Please try again or return to the homepage.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            Error ID: {error.digest}
          </p>
        )}
      </div>
      <div className="flex gap-3">
        <Button variant="outline" onClick={reset} className="gap-2">
          <RefreshCcw className="size-4" />
          Try Again
        </Button>
        <Link href="/" className={cn(buttonVariants(), 'gap-2')}>
          <Home className="size-4" />
          Go Home
        </Link>
      </div>
    </div>
  );
}

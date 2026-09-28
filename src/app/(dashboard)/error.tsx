'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AlertTriangleIcon, HomeIcon, RotateCcwIcon } from 'lucide-react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Dashboard Error]', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-8 px-6 text-center">
      <div className="flex size-20 items-center justify-center rounded-2xl bg-destructive/10">
        <AlertTriangleIcon className="size-10 text-destructive" />
      </div>
      <div>
        <h2 className="text-2xl font-bold">Something went wrong</h2>
        <p className="mx-auto mt-3 max-w-md text-base text-muted-foreground">
          An unexpected error occurred while loading this page. Please try again
          or return to the dashboard.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-muted-foreground/60">
            Error ID: {error.digest}
          </p>
        )}
      </div>
      <div className="flex gap-3">
        <Button variant="outline" onClick={reset} className="gap-2">
          <RotateCcwIcon className="size-4" />
          Try Again
        </Button>
        <Link href="/projects">
          <Button className="gap-2">
            <HomeIcon className="size-4" />
            Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}

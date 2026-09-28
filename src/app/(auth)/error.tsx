'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AlertTriangleIcon, RotateCcwIcon } from 'lucide-react';

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Auth Error]', error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 text-center">
      <div className="flex size-20 items-center justify-center rounded-2xl bg-destructive/10">
        <AlertTriangleIcon className="size-10 text-destructive" />
      </div>
      <div>
        <h2 className="text-2xl font-bold">Authentication Error</h2>
        <p className="mx-auto mt-3 max-w-md text-base text-muted-foreground">
          Something went wrong with authentication. Please try again.
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
        <Link href="/login">
          <Button>Back to Login</Button>
        </Link>
      </div>
    </div>
  );
}

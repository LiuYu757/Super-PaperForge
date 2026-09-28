'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { AlertTriangleIcon, FolderIcon, RotateCcwIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function EditorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Editor Error]', error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-6 text-center">
      <div className="flex size-20 items-center justify-center rounded-2xl bg-destructive/10">
        <AlertTriangleIcon className="size-10 text-destructive" aria-hidden="true" />
      </div>
      <div role="alert" aria-live="assertive">
        <h2 className="text-2xl font-bold">Editor Error</h2>
        <p className="mx-auto mt-3 max-w-md text-base text-muted-foreground">
          The editor encountered an unexpected error. This may be caused by a
          connection issue or an invalid project. Please try reloading.
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
          Reload Editor
        </Button>
        <Link href="/projects" className={cn(buttonVariants(), 'gap-2')}>
          <FolderIcon className="size-4" />
          Back to Projects
        </Link>
      </div>
    </div>
  );
}

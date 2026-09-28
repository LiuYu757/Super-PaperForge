import { FileQuestion, Home, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-6">
      {/* Decorative background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-orange-500/5 via-transparent to-transparent"
      />

      <div className="flex size-20 items-center justify-center rounded-2xl bg-orange-500/10">
        <FileQuestion className="size-10 text-orange-500" />
      </div>

      <div className="text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-orange-500">
          Error 404
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          Page not found
        </h1>
        <p className="mx-auto mt-3 max-w-md text-base text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
          Check the URL or navigate back to safety.
        </p>
      </div>

      <div className="flex gap-3">
        <Link href="/">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="size-4" />
            Go Back
          </Button>
        </Link>
        <Link href="/projects">
          <Button className="gap-2">
            <Home className="size-4" />
            Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}

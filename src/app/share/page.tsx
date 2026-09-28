'use client';

import 'katex/dist/katex.min.css';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { FlameIcon, CopyIcon, CheckIcon, CodeIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { copyToClipboard } from '@/lib/clipboard';

function ShareContent() {
  const params = useSearchParams();
  const code = params.get('code');
  const name = params.get('name') || 'snippet.tex';
  const [copied, setCopied] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  let decoded = '';
  try {
    decoded = code ? new TextDecoder().decode(Uint8Array.from(atob(code), c => c.charCodeAt(0))) : '';
  } catch {
    decoded = '';
  }

  // Try to render math blocks with KaTeX
  useEffect(() => {
    if (!previewRef.current || !decoded) return;
    const mathRegex = /\$\$([^$]+)\$\$|\\\[([^\]]+)\\\]/g;
    let match;
    const mathBlocks: string[] = [];
    while ((match = mathRegex.exec(decoded)) !== null) {
      mathBlocks.push(match[1] || match[2]);
    }
    if (mathBlocks.length === 0) return;

    import('katex').then((katex) => {
      if (!previewRef.current) return;
      // Clear previous content safely
      previewRef.current.textContent = '';
      for (const latex of mathBlocks) {
        try {
          const wrapper = document.createElement('div');
          wrapper.style.margin = '12px 0';
          wrapper.style.textAlign = 'center';
          // Use KaTeX DOM rendering instead of innerHTML to avoid XSS
          katex.default.render(latex.trim(), wrapper, {
            displayMode: true,
            throwOnError: false,
            trust: false,
            maxSize: 500,
            maxExpand: 100,
          });
          previewRef.current.appendChild(wrapper);
        } catch { /* skip invalid math */ }
      }
    });
  }, [decoded]);

  async function handleCopy() {
    const ok = await copyToClipboard(decoded, 'Code copied');
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
  }

  if (!decoded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">No snippet to display</p>
      </div>
    );
  }

  const lines = decoded.split('\n').length;

  return (
    <div className="min-h-screen bg-background">
      <nav className="flex items-center justify-between border-b px-6 py-3">
        <Link href="/" className="flex items-center gap-2 text-sm font-bold">
          <FlameIcon className="size-4 text-orange-500" />
          PaperForge
        </Link>
        <Link href="/register">
          <Button size="sm">Get Started Free</Button>
        </Link>
      </nav>

      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CodeIcon className="size-4 text-muted-foreground" />
            <h1 className="text-lg font-semibold">{name}</h1>
            <span className="text-xs text-muted-foreground">{lines} lines</span>
          </div>
          <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
            {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>

        {/* Code block */}
        <div className="rounded-lg border bg-zinc-50 dark:bg-zinc-950">
          <pre className="overflow-auto p-4 font-mono text-sm leading-relaxed">
            {decoded.split('\n').map((line, i) => (
              <div key={i} className="flex">
                <span className="mr-4 inline-block w-8 select-none text-right text-zinc-400">{i + 1}</span>
                <span>{line}</span>
              </div>
            ))}
          </pre>
        </div>

        {/* Math preview */}
        <div ref={previewRef} className="mt-4" />

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Shared via <Link href="/" className="text-orange-500 hover:underline">PaperForge</Link> — the open-source LaTeX editor
        </p>
      </div>
    </div>
  );
}

function ShareSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="flex items-center justify-between border-b px-6 py-3">
        <div className="h-5 w-28 animate-pulse rounded bg-muted" />
        <div className="h-8 w-28 animate-pulse rounded bg-muted" />
      </nav>
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-4 animate-pulse rounded bg-muted" />
            <div className="h-5 w-32 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-8 w-20 animate-pulse rounded bg-muted" />
        </div>
        <div className="space-y-2 rounded-lg border p-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-muted" style={{ width: `${60 + Math.random() * 40}%`, animationDelay: `${i * 50}ms` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SharePage() {
  return (
    <Suspense fallback={<ShareSkeleton />}>
      <ShareContent />
    </Suspense>
  );
}

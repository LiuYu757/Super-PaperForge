import type { Metadata } from 'next';
import Link from 'next/link';
import { FlameIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = {
  title: 'Changelog',
  description: 'PaperForge release history — new features, improvements, and fixes.',
};

const RELEASES = [
  { version: '23.0.0', date: '2026-03-29', label: 'Latest', items: [
    'Atomic Lua rate limiter — prevents TOCTOU race condition bypass',
    'CSP hardened: removed unsafe-eval from script-src',
    'KaTeX rendering: DOM-based render() replaces innerHTML in share/equation',
    'File path encoding: all 15+ client fetch calls now URL-encode paths',
    'Path validation: backslash, double-slash, Windows absolute path rejection',
    'Register/invite: fire-and-forget emails prevent timing side-channels',
    'Compilation log: full light theme support with semantic CSS classes',
    'Status bar: responsive breakpoints prevent overflow on narrow screens',
    'ARIA: tablist, progressbar, meter, aria-pressed across 12 components',
    'AnimatedCounter: rAF cancelled on unmount (memory leak fix)',
    'Clipboard: execCommand return value checked, try/finally cleanup',
    'All 2,062 tests passing with 2 skipped suites tracked — 0 regressions across this SaaS foundation review',
  ]},
  { version: '22.1.0', date: '2026-03-29', label: '', items: [
    'SyncTeX/ZIP export buffer size limits — all download routes protected',
    'Project creation rate limiting (20/hour per user)',
    'File CRUD API: path validation + content size cap + rate limiting',
    'Deprecated escape()/unescape() replaced with TextEncoder/TextDecoder',
  ]},
  { version: '21.0.0', date: '2026-03-29', label: '', items: [
    'Email XSS prevention: escapeHtml() on all user data in templates',
    'PDF/DOCX download stream buffer capped at 50MB (OOM prevention)',
    'Git credential token length limited to 4KB',
  ]},
  { version: '20.0.0', date: '2026-03-29', label: '', items: [
    'Version service IDOR fix: projectId validation on restore/diff',
    'Member invitation rate limiting (20/hour)',
    'Upload path hardening: URL-decode + backslash normalization',
  ]},
  { version: '19.0.0', date: '2026-03-29', label: '', items: [
    'CSRF protection via Sec-Fetch-Site middleware validation',
    'Prototype pollution prevention in settings API (key whitelist)',
    'Health endpoint hardened: no latencies or infrastructure details exposed',
    'isValidFilePath blocks Windows/UNC paths, null bytes, control chars',
    'Removed non-functional "Remember Me" checkbox from login',
  ]},
  { version: '18.5.0', date: '2026-03-29', label: '', items: [
    'Landing page detects logged-in users (Go to Dashboard vs Get Started)',
    'Changelog overhaul with realistic release timeline',
    'Command palette: semantic icons (Sparkles for AI, FileText for files)',
    'Progress bar accessibility (role=progressbar, aria-valuenow)',
  ]},
  { version: '18.1.0', date: '2026-03-29', label: '', items: [
    'Unified clipboard utility with browser fallback (13 operations)',
    'Rate limiter: crypto.randomUUID() for collision resistance',
    'Fixed useState-as-useEffect bugs in 6 components',
    'next/image migration, path validation improvements',
  ]},
  { version: '18.0.0', date: '2026-03-28', label: '', items: [
    'Focus mode (F11) for distraction-free writing',
    '42 keyboard shortcuts documented in help dialog',
    'Ctrl+Shift+C compilation, Ctrl+J log toggle, Ctrl+\\ sidebar toggle',
  ]},
  { version: '7.0.0', date: '2026-03-27', label: '', items: [
    'Crash recovery — tabs persist to localStorage',
    'AI LaTeX assistant (Claude-powered, 4 modes)',
    'Equation builder (19 templates + KaTeX preview)',
    'Table generator with booktabs format',
    'Public share pages with KaTeX math rendering',
    '12 right-panel types, 160+ completions, 27 snippets',
  ]},
  { version: '2.0.0', date: '2026-03-26', label: '', items: [
    'Live Vercel deployment',
    'Pricing page, Privacy & Terms, Documentation hub',
    'BibTeX autocomplete, environment auto-close',
    '454 integration tests',
  ]},
  { version: '1.0.0', date: '2026-03-25', label: '', items: [
    'CodeMirror 6 editor with LaTeX syntax highlighting',
    'Real-time collaboration via Yjs CRDT + WebSocket',
    'PDF viewer with SyncTeX, zoom, keyboard navigation',
    'Git integration (push/pull), version history',
    'DOCX export via Pandoc, admin panel',
  ]},
];

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="flex items-center gap-2 border-b px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <FlameIcon className="size-6 text-orange-500" />
          <span className="text-lg font-bold">PaperForge</span>
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">Changelog</span>
      </nav>
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-4xl font-extrabold tracking-tight">Changelog</h1>
        <p className="mt-2 text-muted-foreground">All notable changes to PaperForge.</p>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="inline-block size-2 rounded-full bg-green-400" aria-hidden="true" /> Feature / Improvement</span>
          <span className="flex items-center gap-1.5"><span className="inline-block size-2 rounded-full bg-yellow-400" aria-hidden="true" /> Bug Fix</span>
          <span className="flex items-center gap-1.5"><span className="inline-block size-2 rounded-full bg-red-400" aria-hidden="true" /> Security</span>
        </div>
        <div className="mt-10 space-y-8">
          {RELEASES.map((r) => (
            <div key={r.version} className="relative pl-8 before:absolute before:left-3 before:top-0 before:h-full before:w-px before:bg-border">
              <div className="absolute left-0 top-1 size-6 rounded-full border-2 border-orange-400 bg-background" />
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold">v{r.version}</h2>
                <span className="text-sm text-muted-foreground">{r.date}</span>
                {r.label && <Badge className="bg-orange-500 text-white">{r.label}</Badge>}
              </div>
              <ul className="mt-2 space-y-1.5">
                {r.items.map((item) => {
                  const isSecurity = /CSRF|XSS|IDOR|hardened|prevention|protection|blocked?s?|limit/i.test(item);
                  const isFix = /fix|replaced|removed|bug/i.test(item);
                  return (
                    <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className={`mt-0.5 inline-block size-1.5 shrink-0 rounded-full ${
                        isSecurity ? 'bg-red-400' : isFix ? 'bg-yellow-400' : 'bg-green-400'
                      }`} aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

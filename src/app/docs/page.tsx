'use client';

import Link from 'next/link';
import { FlameIcon, BookOpenIcon, KeyboardIcon, CodeIcon, GitBranchIcon, FileTextIcon, UsersIcon, ZapIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const DOCS = [
  { icon: CodeIcon, title: 'Getting Started', desc: 'Create your first project and compile a LaTeX document in under a minute.', href: '/docs/getting-started' },
  { icon: KeyboardIcon, title: 'Keyboard Shortcuts', desc: '23 shortcuts for formatting, navigation, compilation, and more.', href: '#shortcuts' },
  { icon: FileTextIcon, title: 'LaTeX Symbols', desc: '160+ commands, 27 snippets, BibTeX entries, Greek alphabet, and math symbols.', href: '/docs/symbols' },
  { icon: UsersIcon, title: 'API Reference', desc: '40+ REST endpoints for projects, files, compilation, and user management.', href: '/docs/api' },
  { icon: GitBranchIcon, title: 'Git Integration', desc: 'Push/pull to GitHub, GitLab, or Bitbucket with encrypted credentials.', href: '/docs/getting-started#git' },
  { icon: ZapIcon, title: 'Auto-Compile', desc: '2-second debounce auto-compilation with PDF preview and DOCX export.', href: '/docs/getting-started#compile' },
  { icon: BookOpenIcon, title: 'Templates', desc: 'IEEE, ACM, Springer, Beamer, thesis, CV — start with curated templates.', href: '/docs/templates' },
];

const SHORTCUTS = [
  { keys: 'Ctrl+S', action: 'Save' }, { keys: 'Ctrl+B', action: 'Bold' },
  { keys: 'Ctrl+I', action: 'Italic' }, { keys: 'Ctrl+U', action: 'Underline' },
  { keys: 'Ctrl+M', action: 'Math $...$' }, { keys: 'Ctrl+/', action: 'Comment' },
  { keys: 'Ctrl+Enter', action: 'Compile' }, { keys: 'Ctrl+K', action: 'Command Palette' },
  { keys: 'Ctrl+G', action: 'Go to Line' }, { keys: 'Ctrl+F', action: 'Find' },
  { keys: 'Ctrl+Shift+F', action: 'Find in Project' }, { keys: 'Ctrl+Shift+D', action: 'Duplicate Line' },
  { keys: 'Ctrl+Shift+K', action: 'Delete Line' }, { keys: 'Ctrl+L', action: 'Select Line' },
  { keys: 'Alt+Up/Down', action: 'Move Line' }, { keys: 'Tab', action: 'Indent' },
];

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="flex items-center gap-2 border-b px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <FlameIcon className="size-6 text-orange-500" />
          <span className="text-lg font-bold">PaperForge</span>
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">Documentation</span>
      </nav>

      <div className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-4xl font-extrabold tracking-tight">Documentation</h1>
        <p className="mt-2 text-lg text-muted-foreground">Everything you need to use PaperForge effectively.</p>

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {DOCS.map(({ icon: Icon, title, desc, href }) => (
            <a key={title} href={href}>
              <Card className="h-full transition-all hover:shadow-md hover:-translate-y-0.5">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <Icon className="size-5 text-orange-500" />
                  <CardTitle className="text-base">{title}</CardTitle>
                </CardHeader>
                <CardContent><CardDescription>{desc}</CardDescription></CardContent>
              </Card>
            </a>
          ))}
        </div>

        <section id="shortcuts" className="mt-16">
          <h2 className="text-2xl font-bold">Keyboard Shortcuts</h2>
          <div className="mt-4 grid gap-1 sm:grid-cols-2">
            {SHORTCUTS.map(({ keys, action }) => (
              <div key={keys} className="flex items-center justify-between rounded-md border px-3 py-2">
                <span className="text-sm text-muted-foreground">{action}</span>
                <kbd className="rounded bg-muted px-2 py-0.5 font-mono text-xs">{keys}</kbd>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

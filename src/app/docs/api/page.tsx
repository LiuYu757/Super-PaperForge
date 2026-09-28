'use client';

import Link from 'next/link';
import { useState } from 'react';
import { FlameIcon, ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Endpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  description: string;
  auth: boolean;
}

const GROUPS: { name: string; endpoints: Endpoint[] }[] = [
  {
    name: 'Authentication',
    endpoints: [
      { method: 'POST', path: '/api/v1/auth/register', description: 'Register new user', auth: false },
      { method: 'POST', path: '/api/v1/auth/[...nextauth]', description: 'Login (NextAuth)', auth: false },
      { method: 'POST', path: '/api/v1/auth/forgot-password', description: 'Request password reset', auth: false },
      { method: 'POST', path: '/api/v1/auth/reset-password', description: 'Reset with token', auth: false },
      { method: 'GET', path: '/api/v1/auth/verify-email/:token', description: 'Verify email', auth: false },
    ],
  },
  {
    name: 'Billing',
    endpoints: [
      { method: 'GET', path: '/api/v1/billing/plans', description: 'List commercial plan catalog', auth: false },
      { method: 'POST', path: '/api/v1/billing/checkout', description: 'Start hosted checkout or sales-assisted upgrade', auth: true },
      { method: 'POST', path: '/api/v1/billing/sales-inquiry', description: 'Send Team sales inquiry', auth: true },
    ],
  },
  {
    name: 'Projects',
    endpoints: [
      { method: 'GET', path: '/api/v1/projects', description: 'List user projects', auth: true },
      { method: 'POST', path: '/api/v1/projects', description: 'Create project', auth: true },
      { method: 'GET', path: '/api/v1/projects/:id', description: 'Get project details', auth: true },
      { method: 'PATCH', path: '/api/v1/projects/:id', description: 'Update project', auth: true },
      { method: 'DELETE', path: '/api/v1/projects/:id', description: 'Delete project', auth: true },
      { method: 'GET', path: '/api/v1/projects/:id/export', description: 'Download as ZIP', auth: true },
    ],
  },
  {
    name: 'Files',
    endpoints: [
      { method: 'GET', path: '/api/v1/projects/:id/files', description: 'List files', auth: true },
      { method: 'GET', path: '/api/v1/projects/:id/files/:path', description: 'Read file', auth: true },
      { method: 'PUT', path: '/api/v1/projects/:id/files/:path', description: 'Write file', auth: true },
      { method: 'DELETE', path: '/api/v1/projects/:id/files/:path', description: 'Delete file', auth: true },
      { method: 'POST', path: '/api/v1/projects/:id/files/upload', description: 'Upload binary', auth: true },
    ],
  },
  {
    name: 'Compilation',
    endpoints: [
      { method: 'POST', path: '/api/v1/projects/:id/compile', description: 'Trigger compilation', auth: true },
      { method: 'GET', path: '/api/v1/projects/:id/compile/:cid/status', description: 'Check status', auth: true },
      { method: 'GET', path: '/api/v1/projects/:id/compile/:cid/pdf', description: 'Download PDF', auth: true },
      { method: 'GET', path: '/api/v1/projects/:id/compile/:cid/docx', description: 'Download DOCX', auth: true },
    ],
  },
  {
    name: 'Collaboration',
    endpoints: [
      { method: 'GET', path: '/api/v1/projects/:id/members', description: 'List members', auth: true },
      { method: 'POST', path: '/api/v1/projects/:id/members', description: 'Invite member', auth: true },
      { method: 'GET', path: '/api/v1/projects/:id/share-link', description: 'List active share links (owner only)', auth: true },
      { method: 'POST', path: '/api/v1/projects/:id/share-link', description: 'Create share link', auth: true },
      { method: 'DELETE', path: '/api/v1/projects/:id/share-link/:linkId', description: 'Revoke share link (owner only)', auth: true },
      { method: 'POST', path: '/api/v1/join/:token', description: 'Join via link', auth: true },
    ],
  },
  {
    name: 'Version History & Git',
    endpoints: [
      { method: 'GET', path: '/api/v1/projects/:id/versions', description: 'List versions', auth: true },
      { method: 'POST', path: '/api/v1/projects/:id/versions', description: 'Create version', auth: true },
      { method: 'POST', path: '/api/v1/projects/:id/git/link', description: 'Link remote', auth: true },
      { method: 'POST', path: '/api/v1/projects/:id/git/push', description: 'Push to remote', auth: true },
      { method: 'POST', path: '/api/v1/projects/:id/git/pull', description: 'Pull from remote', auth: true },
    ],
  },
];

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  POST: 'bg-green-500/10 text-green-600 border-green-500/20',
  PATCH: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  DELETE: 'bg-red-500/10 text-red-600 border-red-500/20',
  PUT: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
};

export default function ApiDocsPage() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <div className="min-h-screen bg-background">
      <nav className="flex items-center gap-2 border-b px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <FlameIcon className="size-6 text-orange-500" />
          <span className="text-lg font-bold">PaperForge</span>
        </Link>
        <span className="text-muted-foreground">/</span>
        <Link href="/docs" className="text-sm text-muted-foreground hover:text-foreground">Docs</Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">API Reference</span>
      </nav>

      <div className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-4xl font-extrabold tracking-tight">API Reference</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          Project, collaboration, export, and billing endpoints. All responses follow <code className="rounded bg-muted px-1.5 py-0.5 text-sm">{'{ success, data }'}</code> format.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">Base URL: <code className="rounded bg-muted px-1.5 py-0.5">https://your-domain.com</code> or <code className="rounded bg-muted px-1.5 py-0.5">http://localhost:3000</code></p>

        <div className="mt-12 space-y-6">
          {GROUPS.map((group) => (
            <div key={group.name} className="rounded-xl border">
              <button
                className="flex w-full items-center justify-between px-4 py-3 text-left font-semibold hover:bg-muted/50"
                onClick={() => setExpanded(p => ({ ...p, [group.name]: !p[group.name] }))}
              >
                <span>{group.name} <Badge variant="secondary" className="ml-2 text-[10px]">{group.endpoints.length}</Badge></span>
                {expanded[group.name] ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
              </button>
              {expanded[group.name] && (
                <div className="border-t divide-y">
                  {group.endpoints.map((ep) => (
                    <div key={ep.path + ep.method} className="flex items-center gap-3 px-4 py-2.5">
                      <Badge variant="outline" className={cn('w-16 justify-center text-[10px] font-bold', METHOD_COLORS[ep.method])}>
                        {ep.method}
                      </Badge>
                      <code className="flex-1 font-mono text-sm">{ep.path}</code>
                      <span className="text-xs text-muted-foreground">{ep.description}</span>
                      {ep.auth && <Badge variant="outline" className="text-[9px]">Auth</Badge>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

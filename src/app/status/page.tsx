'use client';

import { FlameIcon, CheckCircleIcon, AlertTriangleIcon, XCircleIcon, RefreshCcwIcon } from 'lucide-react';
import Link from 'next/link';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';


interface HealthData {
  status: string;
  version?: string;
  timestamp?: string;
  uptime?: number;
  checks?: Record<string, { status: string; latency?: number }>;
}

export default function StatusPage() {
  const { data, error: fetchError, isLoading, mutate } = useSWR<HealthData>('/api/healthz', fetcher, { refreshInterval: 10000 });

  const Icon = data?.status === 'ok' ? CheckCircleIcon : data?.status === 'degraded' ? AlertTriangleIcon : XCircleIcon;
  const color = data?.status === 'ok' ? 'text-green-500' : data?.status === 'degraded' ? 'text-amber-500' : 'text-red-500';
  const label = data?.status === 'ok' ? 'All Systems Operational' : data?.status === 'degraded' ? 'Degraded Performance' : 'System Down';

  return (
    <div className="min-h-screen bg-background">
      <nav className="flex items-center justify-between border-b px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <FlameIcon className="size-6 text-orange-500" />
          <span className="text-lg font-bold">PaperForge</span>
        </Link>
        <Button variant="outline" size="sm" onClick={() => mutate()} className="gap-1.5">
          <RefreshCcwIcon className="size-3.5" /> Refresh
        </Button>
      </nav>

      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-4xl font-extrabold tracking-tight">System Status</h1>

        {isLoading ? (
          <div className="mt-8 space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />)}
          </div>
        ) : data ? (
          <>
            <div className={`mt-8 flex items-center gap-3 rounded-xl border p-4 ${data.status === 'ok' ? 'bg-green-500/5 border-green-500/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
              <Icon className={`size-6 ${color}`} />
              <span className={`text-lg font-semibold ${color}`}>{label}</span>
              <Badge variant="outline" className="ml-auto text-xs">v{data.version}</Badge>
            </div>

            <div className="mt-6 space-y-2">
              {Object.entries(data.checks ?? {}).map(([name, check]) => (
                <div key={name} className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div className="flex items-center gap-2">
                    {check.status === 'ok' ? (
                      <CheckCircleIcon className="size-4 text-green-500" />
                    ) : (
                      <XCircleIcon className="size-4 text-red-500" />
                    )}
                    <span className="font-medium capitalize">{name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {check.latency && <span className="text-xs text-muted-foreground">{check.latency}ms</span>}
                    <Badge variant={check.status === 'ok' ? 'secondary' : 'destructive'} className="text-[10px]">
                      {check.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-6 text-center text-xs text-muted-foreground">
              Uptime: {Math.floor((data.uptime ?? 0) / 3600)}h {Math.floor(((data.uptime ?? 0) % 3600) / 60)}m · Auto-refreshes every 10s
            </p>
          </>
        ) : fetchError ? (
          <div className="mt-8 rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
            <XCircleIcon className="mx-auto size-8 text-red-500" />
            <h2 className="mt-3 text-lg font-semibold text-red-600 dark:text-red-400">Unable to Reach Status API</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The health endpoint did not respond. This may indicate a network issue or a full outage.
            </p>
            <Button variant="outline" size="sm" onClick={() => mutate()} className="mt-4 gap-1.5">
              <RefreshCcwIcon className="size-3.5" /> Try Again
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}


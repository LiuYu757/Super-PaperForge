'use client';

import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { formatBytes } from '@/lib/utils';
import Link from 'next/link';
import {
  UsersIcon,
  FolderIcon,
  PlayIcon,
  HardDriveIcon,
  TrendingUpIcon,
  ActivityIcon,
  AlertTriangleIcon,
  RefreshCcwIcon,
  ArrowRightIcon,
  CircleIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';


interface Stats {
  userCount: number;
  projectCount: number;
  compilationCount: number;
  storageUsedBytes: string;
}

interface HealthData {
  status: 'ok' | 'degraded' | 'down';
  uptime: number;
  checks: Record<string, { status: string; latency?: number }>;
}

interface FunnelStage {
  id: string;
  label: string;
  count: number;
  pctOfRegistered: number | null;
  pctOfPrevious: number | null;
}

interface FunnelData {
  registered: number;
  stages: FunnelStage[];
  conversion: { activated: number; canceled: number; net: number; rate: number | null };
}

interface AttributionData {
  totalUsers: number;
  attributed: number;
  unattributed: number;
  sources: Array<{ source: string; count: number; pct: number | null }>;
  otherCount: number;
  sampled: boolean;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export default function AdminDashboard() {
  const { data: stats, isLoading, mutate } = useSWR<Stats>(
    '/api/v1/admin/stats',
    fetcher,
    { refreshInterval: 10000 },
  );

  const { data: health, error: healthError, isLoading: isHealthLoading } = useSWR<HealthData>(
    '/api/healthz',
    fetcher,
    { refreshInterval: 15000 },
  );

  const { data: funnel } = useSWR<FunnelData>(
    '/api/v1/admin/funnel',
    fetcher,
    { refreshInterval: 30000 },
  );

  const { data: attribution } = useSWR<AttributionData>(
    '/api/v1/admin/attribution',
    fetcher,
    { refreshInterval: 60000 },
  );

  const cards = [
    {
      title: 'Total Users',
      value: stats?.userCount ?? 0,
      icon: UsersIcon,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      href: '/admin/users',
    },
    {
      title: 'Active Projects',
      value: stats?.projectCount ?? 0,
      icon: FolderIcon,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
      href: '#',
    },
    {
      title: 'Compilations',
      value: stats?.compilationCount ?? 0,
      icon: PlayIcon,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
      href: '/admin/workers',
    },
    {
      title: 'Storage Used',
      value: stats ? formatBytes(stats.storageUsedBytes) : '—',
      icon: HardDriveIcon,
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
      href: '#',
    },
  ];

  const statusColor = {
    ok: 'text-green-500',
    degraded: 'text-amber-500',
    down: 'text-red-500',
  };

  const statusBg = {
    ok: 'bg-green-500/10',
    degraded: 'bg-amber-500/10',
    down: 'bg-red-500/10',
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            System overview and real-time statistics
            <Badge variant="outline" className="ml-2 text-[10px]">
              <ActivityIcon className="mr-0.5 size-2.5" />
              Live
            </Badge>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => mutate()} className="gap-1.5">
          <RefreshCcwIcon className="size-3.5" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
            {isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-32 animate-pulse rounded-xl bg-muted" />
                ))}
              </div>
            ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map(({ title, value, icon: Icon, color, bgColor, href }) => (
            <Link key={title} href={href}>
              <Card className="transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
                  <div className={`flex size-10 items-center justify-center rounded-lg ${bgColor}`}>
                    <Icon className={`size-5 ${color}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">
                    {typeof value === 'number' ? value.toLocaleString() : value}
                  </p>
                  <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <TrendingUpIcon className="size-3" />
                    <span>View details</span>
                    <ArrowRightIcon className="size-3 ml-auto" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* System Health + Quick Links */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* System Health */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ActivityIcon className="size-4" />
              System Health
            </CardTitle>
            <CardDescription>Real-time service status</CardDescription>
          </CardHeader>
          <CardContent>
                {health ? (
                  <div className="space-y-3">
                    {/* Overall status */}
                    <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${statusBg[health.status]}`}>
                  <div className="flex items-center gap-2">
                    {health.status === 'ok' ? (
                      <CheckCircleIcon className="size-4 text-green-500" />
                    ) : health.status === 'degraded' ? (
                      <AlertTriangleIcon className="size-4 text-amber-500" />
                    ) : (
                      <XCircleIcon className="size-4 text-red-500" />
                    )}
                    <span className={`text-sm font-medium capitalize ${statusColor[health.status]}`}>
                      {health.status === 'ok' ? 'All Systems Operational' : health.status === 'degraded' ? 'Degraded Performance' : 'System Down'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ClockIcon className="size-3" />
                    Uptime: {formatUptime(health.uptime)}
                  </div>
                </div>

                {/* Service checks */}
                <div className="space-y-1.5">
                  {Object.entries(health.checks).map(([name, check]) => (
                    <div key={name} className="flex items-center justify-between rounded-md border px-3 py-2">
                      <div className="flex items-center gap-2">
                        <CircleIcon className={`size-2.5 ${check.status === 'ok' ? 'fill-green-500 text-green-500' : 'fill-red-500 text-red-500'}`} />
                        <span className="text-sm capitalize">{name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {check.latency !== undefined && (
                          <span className="text-xs text-muted-foreground">{check.latency}ms</span>
                        )}
                        <Badge variant={check.status === 'ok' ? 'secondary' : 'destructive'} className="text-[10px]">
                          {check.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                    </div>
                  </div>
                ) : isHealthLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                    {healthError
                      ? 'Could not load health status. Retry if this persists.'
                      : 'No health data available'}
                  </div>
                )}
              </CardContent>
            </Card>

        {/* Quick Links */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Actions</CardTitle>
            <CardDescription>Common admin tasks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2">
              <Link href="/admin/users">
                <Button variant="outline" className="w-full justify-start gap-2 h-auto py-3">
                  <UsersIcon className="size-4 text-blue-500" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Manage Users</p>
                    <p className="text-[11px] text-muted-foreground">View, edit, ban users</p>
                  </div>
                </Button>
              </Link>
              <Link href="/admin/templates">
                <Button variant="outline" className="w-full justify-start gap-2 h-auto py-3">
                  <FolderIcon className="size-4 text-green-500" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Templates</p>
                    <p className="text-[11px] text-muted-foreground">Approve submissions</p>
                  </div>
                </Button>
              </Link>
              <Link href="/admin/workers">
                <Button variant="outline" className="w-full justify-start gap-2 h-auto py-3">
                  <PlayIcon className="size-4 text-purple-500" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Workers</p>
                    <p className="text-[11px] text-muted-foreground">Monitor compile queue</p>
                  </div>
                </Button>
              </Link>
              <Link href="/admin/audit-log">
                <Button variant="outline" className="w-full justify-start gap-2 h-auto py-3">
                  <ActivityIcon className="size-4 text-orange-500" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Audit Log</p>
                    <p className="text-[11px] text-muted-foreground">View admin actions</p>
                  </div>
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Growth Funnel */}
      {funnel && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUpIcon className="size-4" />
              Growth Funnel
            </CardTitle>
            <CardDescription>
              Acquisition → activation and paid conversion
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {funnel.stages.map((stage) => (
                <div key={stage.id} className="rounded-md border px-3 py-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{stage.label}</span>
                    <span className="tabular-nums">
                      {stage.count.toLocaleString()}
                      {stage.pctOfRegistered !== null && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {stage.pctOfRegistered}% of registered
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${stage.pctOfRegistered ?? 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-md bg-green-500/10 px-3 py-2">
                <p className="text-xs text-muted-foreground">Paid conversions</p>
                <p className="text-xl font-bold text-green-600 dark:text-green-400">
                  {funnel.conversion.activated.toLocaleString()}
                  {funnel.conversion.rate !== null && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      ({funnel.conversion.rate}%)
                    </span>
                  )}
                </p>
              </div>
              <div className="rounded-md bg-red-500/10 px-3 py-2">
                <p className="text-xs text-muted-foreground">Cancellations</p>
                <p className="text-xl font-bold text-red-600 dark:text-red-400">
                  {funnel.conversion.canceled.toLocaleString()}
                </p>
              </div>
              <div className="rounded-md bg-blue-500/10 px-3 py-2">
                <p className="text-xs text-muted-foreground">Net active subs</p>
                <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                  {funnel.conversion.net.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Acquisition Sources */}
      {attribution && attribution.attributed > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUpIcon className="size-4" />
              Acquisition Sources
            </CardTitle>
            <CardDescription>
              First-touch attribution · {attribution.attributed.toLocaleString()} of{' '}
              {attribution.totalUsers.toLocaleString()} users attributed
              {attribution.sampled ? ' (sampled)' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {attribution.sources.map((src) => (
                <div key={src.source} className="rounded-md border px-3 py-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{src.source}</span>
                    <span className="tabular-nums">
                      {src.count.toLocaleString()}
                      {src.pct !== null && (
                        <span className="ml-2 text-xs text-muted-foreground">{src.pct}%</span>
                      )}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${src.pct ?? 0}%` }}
                    />
                  </div>
                </div>
              ))}
              {attribution.otherCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  + {attribution.otherCount.toLocaleString()} from other sources
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

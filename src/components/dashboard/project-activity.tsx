'use client';

import { useState, useEffect } from 'react';
import { ClockIcon, FileEditIcon, PlayIcon, UserPlusIcon, GitBranchIcon } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { fetcher } from '@/lib/fetcher';
import { formatDistanceToNow } from 'date-fns';

interface ActivityItem {
  id: string;
  type: 'edit' | 'compile' | 'member' | 'version';
  message: string;
  timestamp: string;
  user?: string;
}

const ACTIVITY_ICONS = {
  edit: FileEditIcon,
  compile: PlayIcon,
  member: UserPlusIcon,
  version: GitBranchIcon,
};

const ACTIVITY_COLORS = {
  edit: 'text-blue-500 bg-blue-500/10',
  compile: 'text-green-500 bg-green-500/10',
  member: 'text-purple-500 bg-purple-500/10',
  version: 'text-orange-500 bg-orange-500/10',
};

interface ProjectActivityProps {
  projectId: string;
}

export function ProjectActivity({ projectId }: ProjectActivityProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchActivity() {
      try {
        const [compilations, versions] = await Promise.all([
          fetcher<Array<{ id: string; status: string; createdAt: string }>>(`/api/v1/projects/${projectId}/compilations?limit=5`).catch(() => []),
          fetcher<Array<{ id: string; label?: string; createdAt: string }>>(`/api/v1/projects/${projectId}/versions?limit=5`).catch(() => []),
        ]);

        const items: ActivityItem[] = [];

        if (Array.isArray(compilations)) {
          compilations.forEach((c) => {
            items.push({ id: `c-${c.id}`, type: 'compile', message: `Compilation ${c.status}`, timestamp: c.createdAt });
          });
        }

        if (Array.isArray(versions)) {
          versions.forEach((v) => {
            items.push({ id: `v-${v.id}`, type: 'version', message: v.label || 'Version saved', timestamp: v.createdAt });
          });
        }

        // Sort by timestamp descending
        items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setActivities(items.slice(0, 10));
      } catch {
        // Silently handle — activity is non-critical
      } finally {
        setLoading(false);
      }
    }

    fetchActivity();
  }, [projectId]);

  if (loading) {
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-2">
            <div className="size-6 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-1">
              <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-2 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
        <ClockIcon className="size-3.5" />
        No recent activity
      </div>
    );
  }

  return (
    <ScrollArea className="max-h-48">
      <div className="space-y-1 p-2">
        {activities.map((activity) => {
          const Icon = ACTIVITY_ICONS[activity.type];
          const color = ACTIVITY_COLORS[activity.type];
          return (
            <div key={activity.id} className="flex items-start gap-2 rounded-md px-2 py-1.5 text-xs">
              <div className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${color}`}>
                <Icon className="size-3" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{activity.message}</p>
                <p className="text-[10px] text-muted-foreground">
                  {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

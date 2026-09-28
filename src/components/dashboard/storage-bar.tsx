'use client';

import { cn, formatBytes } from '@/lib/utils';

interface StorageBarProps {
  usedBytes: number;
  quotaBytes: number;
  className?: string;
}

export function StorageBar({ usedBytes, quotaBytes, className }: StorageBarProps) {
  const percentage = quotaBytes > 0 ? Math.min((usedBytes / quotaBytes) * 100, 100) : 0;

  const barColor =
    percentage >= 90
      ? 'bg-red-500'
      : percentage >= 70
        ? 'bg-yellow-500'
        : 'bg-primary';

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Storage</span>
        <span>
          {formatBytes(usedBytes)} / {formatBytes(quotaBytes)}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', barColor)}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

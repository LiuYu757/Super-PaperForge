'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';


interface AuditEntry {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  details?: Record<string, unknown> | null;
  createdAt: string;
  actorEmail?: string | null;
  admin: { id: string; name: string; email: string } | null;
}

const ACTION_COLORS: Record<string, string> = {
  update_user: 'bg-blue-100 text-blue-700',
  approve_template: 'bg-green-100 text-green-700',
  reject_template: 'bg-red-100 text-red-700',
};

export default function AdminAuditLogPage() {
  const [page, setPage] = useState(1);
  const limit = 50;

  const { data } = useSWR<{ entries: AuditEntry[]; total: number; page: number; limit: number }>(
    `/api/v1/admin/audit-log?page=${page}&limit=${limit}`,
    fetcher,
    { refreshInterval: 15000 },
  );

  const totalPages = data ? Math.ceil(data.total / limit) : 1;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-sm text-muted-foreground">
          {data?.total ?? 0} total audit events
        </p>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Admin</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {new Date(entry.createdAt).toLocaleString()}
                </TableCell>
                <TableCell>
                  <div>
                    <p className="text-sm font-medium">
                      {entry.admin?.name ?? 'Deleted user'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {entry.admin?.email ?? entry.actorEmail ?? '—'}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    className={
                      ACTION_COLORS[entry.action] ??
                      'bg-gray-100 text-gray-700'
                    }
                    variant="outline"
                  >
                    {entry.action.replace(/_/g, ' ')}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div>
                    <Badge variant="secondary" className="capitalize text-xs">
                      {entry.targetType}
                    </Badge>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {entry.targetId.slice(0, 8)}…
                    </p>
                  </div>
                </TableCell>
                <TableCell className="max-w-xs">
                  {entry.details ? (
                    <pre className="rounded bg-muted px-2 py-1 font-mono text-xs">
                      {JSON.stringify(entry.details, null, 1)}
                    </pre>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!data?.entries.length && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No audit events found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeftIcon className="size-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

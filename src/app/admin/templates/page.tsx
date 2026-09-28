'use client';

import useSWR, { mutate } from 'swr';
import { fetcher } from '@/lib/fetcher';
import { useState } from 'react';
import { CheckIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';


interface PendingTemplate {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  author?: { id: string; name: string; email: string } | null;
  sourceProject?: { id: string; name: string } | null;
  createdAt: string;
}

const KEY = '/api/v1/admin/templates/pending';

export default function AdminTemplatesPage() {
  const { data: templates } = useSWR<PendingTemplate[]>(KEY, fetcher, { refreshInterval: 15000 });
  const [actioning, setActioning] = useState<string | null>(null);

  async function patchTemplate(id: string, approved: boolean): Promise<boolean> {
    const response = await fetch(`/api/v1/admin/templates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const message =
        (body as { error?: { message?: string } })?.error?.message ??
        'Failed to update template';
      toast.error(message);
      return false;
    }

    return true;
  }

  async function handleAction(id: string, approved: boolean) {
    setActioning(id);
    try {
      const ok = await patchTemplate(id, approved);
      if (ok) {
        mutate(KEY);
        toast.success(approved ? 'Template approved' : 'Template rejected');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update template');
    } finally {
      setActioning(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pending Templates</h1>
        <p className="text-sm text-muted-foreground">
          Review and approve or reject user-submitted templates.
        </p>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Author</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates?.map((template) => (
              <TableRow key={template.id}>
                <TableCell>
                  <div>
                    <p className="font-medium">{template.name}</p>
                    {template.description && (
                      <p className="max-w-xs truncate text-xs text-muted-foreground">
                        {template.description}
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {template.category ? (
                    <Badge variant="secondary" className="capitalize">
                      {template.category}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {template.author ? (
                    <div>
                      <p className="text-sm font-medium">{template.author.name}</p>
                      <p className="text-xs text-muted-foreground">{template.author.email}</p>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {template.sourceProject?.name ?? '—'}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(template.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-green-600 hover:bg-green-50"
                      disabled={actioning === template.id}
                      onClick={() => handleAction(template.id, true)}
                    >
                      <CheckIcon className="mr-1 size-4" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:bg-destructive/10"
                      disabled={actioning === template.id}
                      onClick={() => handleAction(template.id, false)}
                    >
                      <XIcon className="mr-1 size-4" />
                      Reject
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!templates?.length && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No pending templates.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

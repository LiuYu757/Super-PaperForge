'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  GitCommitHorizontal,
  Plus,
  RotateCcw,
  Diff,
  LoaderCircle,
  Tag,
  Clock,
  User,
  AlertTriangle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

interface VersionUser {
  id: string;
  name: string;
}

interface Version {
  id: string;
  projectId: string;
  label: string | null;
  gitHash: string;
  createdAt: string;
  user: VersionUser | null;
}

interface VersionHistoryProps {
  projectId: string;
}

export function VersionHistory({ projectId }: VersionHistoryProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [versionToRestore, setVersionToRestore] = useState<Version | null>(null);
  const [labelInput, setLabelInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffContent, setDiffContent] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  const fetchVersions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/v1/projects/${projectId}/versions`);
      if (!res.ok) throw new Error('Failed to load versions');
      const result = await res.json();
      const data = (result.data ?? result) as Version[];
      setVersions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  async function handleCreateVersion() {
    try {
      setCreating(true);
      setError(null);
      const res = await fetch(`/api/v1/projects/${projectId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: labelInput.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create version');
      }
      setLabelInput('');
      setDialogOpen(false);
      await fetchVersions();
      toast.success('Version created');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      toast.error('Failed to create version: ' + msg);
    } finally {
      setCreating(false);
    }
  }

  function openRestoreDialog(version: Version) {
    setVersionToRestore(version);
    setRestoreDialogOpen(true);
  }

  async function handleRestore() {
    if (!versionToRestore) return;
    try {
      setRestoring(versionToRestore.id);
      setError(null);
      const res = await fetch(
        `/api/v1/projects/${projectId}/versions/${versionToRestore.id}/restore`,
        { method: 'POST' },
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to restore version');
      }
      setRestoreDialogOpen(false);
      setVersionToRestore(null);
      toast.success('Version restored');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      toast.error('Failed to restore version: ' + msg);
    } finally {
      setRestoring(null);
    }
  }

  async function handleViewDiff(versionId: string) {
    try {
      setDiffLoading(true);
      setDiffOpen(true);
      const res = await fetch(
        `/api/v1/projects/${projectId}/versions/${versionId}/diff`,
      );
      if (!res.ok) throw new Error('Failed to load diff');
      const result = await res.json();
      const data = result.data ?? result;
      setDiffContent(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
    } catch {
      setDiffContent('Failed to load diff.');
    } finally {
      setDiffLoading(false);
    }
  }

  // Group versions by date
  const groupedVersions = versions.reduce<Record<string, Version[]>>((acc, v) => {
    const date = new Date(v.createdAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    if (!acc[date]) acc[date] = [];
    acc[date].push(v);
    return acc;
  }, {});

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Clock className="size-4" />
          Version History
          {versions.length > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
              {versions.length}
            </Badge>
          )}
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger
            render={
              <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs">
                <Plus className="size-3.5" />
                Save
              </Button>
            }
          />
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Create Version</DialogTitle>
              <DialogDescription>
                Save a named snapshot of your current project state.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              <div className="grid gap-1.5">
                <Label htmlFor="version-label">Label (optional)</Label>
                <Input
                  id="version-label"
                  placeholder="e.g. Draft 1, Before major edits"
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateVersion();
                  }}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={handleCreateVersion}
                disabled={creating}
                size="sm"
                className="gap-1.5"
              >
                {creating ? (
                  <>
                    <LoaderCircle className="size-3.5 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Tag className="size-3.5" />
                    Save Version
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-destructive/10 px-3 py-2">
          <AlertTriangle className="size-3.5 text-destructive" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* Version list */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex flex-col items-center gap-2 px-3 py-8">
            <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Loading versions…</p>
          </div>
        ) : versions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
            <GitCommitHorizontal className="size-8 text-muted-foreground/50" />
            <p className="text-sm font-medium text-muted-foreground">No versions yet</p>
            <p className="text-xs text-muted-foreground">
              Click &ldquo;Save&rdquo; to create your first version snapshot.
            </p>
          </div>
        ) : (
          <div className="py-1">
            {Object.entries(groupedVersions).map(([date, versionGroup]) => (
              <div key={date}>
                <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm px-3 py-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {date}
                  </p>
                </div>
                <ul>
                  {versionGroup.map((v) => (
                    <li
                      key={v.id}
                      className="group relative flex items-start gap-2 px-3 py-2.5 hover:bg-muted/50 transition-colors"
                    >
                      {/* Timeline connector */}
                      <div className="flex flex-col items-center">
                        <div className="mt-1 size-2.5 rounded-full border-2 border-orange-400 bg-background" />
                        <div className="w-px flex-1 bg-border" />
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        {v.label ? (
                          <p className="truncate text-sm font-medium">{v.label}</p>
                        ) : (
                          <p className="truncate text-sm text-muted-foreground italic">
                            Auto-save
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] text-muted-foreground">
                            {formatDistanceToNow(new Date(v.createdAt), {
                              addSuffix: true,
                            })}
                          </span>
                          {v.user && (
                            <Badge variant="outline" className="h-4 gap-0.5 px-1 text-[10px]">
                              <User className="size-2.5" />
                              {v.user.name}
                            </Badge>
                          )}
                          <span
                            className="font-mono text-[10px] text-muted-foreground"
                            title={v.gitHash}
                          >
                            {v.gitHash.slice(0, 7)}
                          </span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-6"
                          title="View diff"
                          onClick={() => handleViewDiff(v.id)}
                        >
                          <Diff className="size-3.5" />
                          <span className="sr-only">View diff</span>
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-6"
                          title="Restore this version"
                          disabled={restoring === v.id}
                          onClick={() => openRestoreDialog(v)}
                        >
                          <RotateCcw className="size-3.5" />
                          <span className="sr-only">Restore</span>
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Restore confirmation dialog */}
      <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-500" />
              Restore Version
            </DialogTitle>
            <DialogDescription>
              This will restore your project to{' '}
              <strong>{versionToRestore?.label || 'this auto-save'}</strong>
              {' '}from{' '}
              {versionToRestore && formatDistanceToNow(new Date(versionToRestore.createdAt), { addSuffix: true })}.
              Current unsaved changes will be overwritten.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRestoreDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleRestore}
              disabled={!!restoring}
              className="gap-1.5"
            >
              {restoring ? (
                <>
                  <LoaderCircle className="size-3.5 animate-spin" />
                  Restoring…
                </>
              ) : (
                <>
                  <RotateCcw className="size-3.5" />
                  Restore
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diff viewer dialog */}
      <Dialog open={diffOpen} onOpenChange={setDiffOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[70vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Diff className="size-5" />
              Version Diff
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[50vh] rounded-md border bg-muted/30">
            {diffLoading ? (
              <div className="flex items-center justify-center py-8">
                <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <pre className="whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed">
                {diffContent || 'No changes found.'}
              </pre>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Separator />
      <p className="px-3 py-1.5 text-[10px] text-muted-foreground">
        Each saved version is a git commit. Restore any version with one click.
      </p>
    </div>
  );
}

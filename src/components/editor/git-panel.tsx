'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  GitBranch,
  Link2,
  Trash2,
  Upload,
  Download,
  Plus,
  CheckCircle,
  XCircle,
  LoaderCircle,
  Shield,
  ExternalLink,
  Key,
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

interface GitCredential {
  id: string;
  provider: string;
  sshPublicKey: string | null;
  createdAt: string;
}

interface GitPanelProps {
  projectId: string;
  remoteUrl?: string | null;
}

export function GitPanel({ projectId, remoteUrl: initialRemote }: GitPanelProps) {
  const [remoteUrl, setRemoteUrl] = useState(initialRemote ?? '');
  const [remoteInput, setRemoteInput] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [linking, setLinking] = useState(false);

  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pushStatus, setPushStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [pullStatus, setPullStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [pushMessage, setPushMessage] = useState('');
  const [pullMessage, setPullMessage] = useState('');

  const [credentials, setCredentials] = useState<GitCredential[]>([]);
  const [credOpen, setCredOpen] = useState(false);
  const [credProvider, setCredProvider] = useState('');
  const [credToken, setCredToken] = useState('');
  const [addingCred, setAddingCred] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const fetchCredentials = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/user/git-credentials');
      if (!res.ok) return;
      const result = await res.json();
      const data = (result.data ?? result) as GitCredential[];
      setCredentials(data);
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  // Auto-clear status messages after 5 seconds
  useEffect(() => {
    if (pushStatus !== 'idle') {
      const timer = setTimeout(() => { setPushStatus('idle'); setPushMessage(''); }, 5000);
      return () => clearTimeout(timer);
    }
  }, [pushStatus]);

  useEffect(() => {
    if (pullStatus !== 'idle') {
      const timer = setTimeout(() => { setPullStatus('idle'); setPullMessage(''); }, 5000);
      return () => clearTimeout(timer);
    }
  }, [pullStatus]);

  async function handleLinkRemote() {
    if (!remoteInput.trim()) return;
    try {
      setLinking(true);
      setError(null);
      const res = await fetch(`/api/v1/projects/${projectId}/git/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remoteUrl: remoteInput.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to link remote');
      }
      setRemoteUrl(remoteInput.trim());
      setRemoteInput('');
      setLinkOpen(false);
      toast.success('Remote linked');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      toast.error('Link failed: ' + msg);
    } finally {
      setLinking(false);
    }
  }

  async function handlePush() {
    try {
      setPushing(true);
      setPushStatus('idle');
      setPushMessage('');
      setError(null);
      const res = await fetch(`/api/v1/projects/${projectId}/git/push`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Push failed');
      }
      setPushStatus('success');
      setPushMessage('Changes pushed to remote successfully.');
      toast.success('Pushed successfully');
    } catch (err) {
      setPushStatus('error');
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setPushMessage(msg);
      setError(msg);
      toast.error('Push failed: ' + msg);
    } finally {
      setPushing(false);
    }
  }

  async function handlePull() {
    try {
      setPulling(true);
      setPullStatus('idle');
      setPullMessage('');
      setError(null);
      const res = await fetch(`/api/v1/projects/${projectId}/git/pull`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Pull failed');
      }
      setPullStatus('success');
      setPullMessage('Latest changes pulled from remote.');
      toast.success('Pulled successfully');
    } catch (err) {
      setPullStatus('error');
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setPullMessage(msg);
      setError(msg);
      toast.error('Pull failed: ' + msg);
    } finally {
      setPulling(false);
    }
  }

  async function handleAddCredential() {
    if (!credProvider.trim() || !credToken.trim()) return;
    try {
      setAddingCred(true);
      setError(null);
      const res = await fetch('/api/v1/user/git-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: credProvider.trim(),
          token: credToken.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save credential');
      }
      setCredProvider('');
      setCredToken('');
      setCredOpen(false);
      await fetchCredentials();
      toast.success('Credential saved');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      toast.error('Failed to save credential: ' + msg);
    } finally {
      setAddingCred(false);
    }
  }

  async function handleDeleteCredential(id: string) {
    try {
      setError(null);
      await fetch(`/api/v1/user/git-credentials/${id}`, { method: 'DELETE' });
      setDeleteConfirm(null);
      await fetchCredentials();
      toast.success('Credential removed');
    } catch {
      setError('Failed to remove credential');
      toast.error('Failed to remove credential');
    }
  }

  function getProviderIcon(provider: string) {
    const p = provider.toLowerCase();
    if (p.includes('github')) return '🔵';
    if (p.includes('gitlab')) return '🟠';
    if (p.includes('bitbucket')) return '🔷';
    return '🔑';
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-1.5 border-b px-3 py-2 text-sm font-medium">
        <GitBranch className="size-4" />
        Git Integration
        {remoteUrl && (
          <Badge variant="secondary" className="ml-auto h-4 gap-0.5 px-1.5 text-[10px]">
            <CheckCircle className="size-2.5 text-green-500" />
            Linked
          </Badge>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-destructive/10 px-3 py-2">
          <AlertTriangle className="size-3.5 shrink-0 text-destructive" />
          <p className="text-xs text-destructive flex-1">{error}</p>
          <button
            className="text-xs text-destructive hover:underline"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-3">
          {/* Remote URL section */}
          <section>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Remote Repository
            </p>
            <div className="rounded-md border px-3 py-2">
              {remoteUrl ? (
                <div className="flex items-center gap-2">
                  <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                  <p className="break-all font-mono text-xs flex-1">{remoteUrl}</p>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Link2 className="size-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground italic">
                    No remote repository linked
                  </p>
                </div>
              )}
            </div>

            <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
              <DialogTrigger
                render={
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 h-7 w-full gap-1.5 text-xs"
                  >
                    <Link2 className="size-3.5" />
                    {remoteUrl ? 'Change Remote' : 'Link Remote Repository'}
                  </Button>
                }
              />
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Link Git Remote</DialogTitle>
                  <DialogDescription>
                    Connect your project to a Git remote for push/pull operations.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-3 py-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="remote-url">Remote URL</Label>
                    <Input
                      id="remote-url"
                      placeholder="https://github.com/user/repo.git"
                      value={remoteInput}
                      onChange={(e) => setRemoteInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleLinkRemote();
                      }}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Supports GitHub, GitLab, Bitbucket, and any Git HTTPS URL.
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={handleLinkRemote}
                    disabled={linking || !remoteInput.trim()}
                    size="sm"
                    className="gap-1.5"
                  >
                    {linking ? (
                      <>
                        <LoaderCircle className="size-3.5 animate-spin" />
                        Linking…
                      </>
                    ) : (
                      <>
                        <Link2 className="size-3.5" />
                        Link
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </section>

          <Separator />

          {/* Push / Pull */}
          <section>
            <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Sync
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 flex-1 gap-1.5 text-xs"
                disabled={pushing || !remoteUrl}
                onClick={handlePush}
              >
                {pushing ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <Upload className="size-3.5" />
                )}
                {pushing ? 'Pushing…' : 'Push'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 flex-1 gap-1.5 text-xs"
                disabled={pulling || !remoteUrl}
                onClick={handlePull}
              >
                {pulling ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <Download className="size-3.5" />
                )}
                {pulling ? 'Pulling…' : 'Pull'}
              </Button>
            </div>
            {!remoteUrl && (
              <p className="mt-1.5 text-[11px] text-muted-foreground italic">
                Link a remote repository to enable push/pull.
              </p>
            )}
            {pushStatus === 'success' && (
              <div className="mt-2 flex items-center gap-1.5 rounded-md bg-green-500/10 px-2.5 py-1.5">
                <CheckCircle className="size-3.5 text-green-600" />
                <p className="text-xs text-green-600">{pushMessage}</p>
              </div>
            )}
            {pushStatus === 'error' && (
              <div className="mt-2 flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1.5">
                <XCircle className="size-3.5 text-destructive" />
                <p className="text-xs text-destructive">{pushMessage}</p>
              </div>
            )}
            {pullStatus === 'success' && (
              <div className="mt-2 flex items-center gap-1.5 rounded-md bg-green-500/10 px-2.5 py-1.5">
                <CheckCircle className="size-3.5 text-green-600" />
                <p className="text-xs text-green-600">{pullMessage}</p>
              </div>
            )}
            {pullStatus === 'error' && (
              <div className="mt-2 flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1.5">
                <XCircle className="size-3.5 text-destructive" />
                <p className="text-xs text-destructive">{pullMessage}</p>
              </div>
            )}
          </section>

          <Separator />

          {/* Credentials */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Shield className="size-3.5 text-muted-foreground" />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Credentials
                </p>
              </div>
              <Dialog open={credOpen} onOpenChange={setCredOpen}>
                <DialogTrigger
                  render={
                    <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-xs">
                      <Plus className="size-3" />
                      Add
                    </Button>
                  }
                />
                <DialogContent className="sm:max-w-sm">
                  <DialogHeader>
                    <DialogTitle>Add Git Credential</DialogTitle>
                    <DialogDescription>
                      Your token is encrypted with AES-256-GCM before storage.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-3 py-2">
                    <div className="grid gap-1.5">
                      <Label htmlFor="cred-provider">Provider</Label>
                      <Input
                        id="cred-provider"
                        placeholder="github / gitlab / bitbucket"
                        value={credProvider}
                        onChange={(e) => setCredProvider(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="cred-token">Personal Access Token</Label>
                      <Input
                        id="cred-token"
                        type="password"
                        placeholder="ghp_…"
                        value={credToken}
                        onChange={(e) => setCredToken(e.target.value)}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Requires repo scope. Token is stored encrypted.
                      </p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={handleAddCredential}
                      disabled={addingCred || !credProvider.trim() || !credToken.trim()}
                      size="sm"
                      className="gap-1.5"
                    >
                      {addingCred ? (
                        <>
                          <LoaderCircle className="size-3.5 animate-spin" />
                          Saving…
                        </>
                      ) : (
                        <>
                          <Key className="size-3.5" />
                          Save Credential
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {credentials.length === 0 ? (
              <div className="rounded-md border border-dashed px-3 py-4 text-center">
                <Key className="mx-auto size-6 text-muted-foreground/50" />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  No credentials saved
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Add a personal access token to enable push/pull.
                </p>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {credentials.map((c) => (
                  <li
                    key={c.id}
                    className="group flex items-center justify-between rounded-md border px-2.5 py-2 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{getProviderIcon(c.provider)}</span>
                      <div>
                        <Badge variant="secondary" className="text-[10px]">
                          {c.provider}
                        </Badge>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          token ••••••••
                        </p>
                      </div>
                    </div>
                    {deleteConfirm === c.id ? (
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => handleDeleteCredential(c.id)}
                        >
                          Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => setDeleteConfirm(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-6 opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={() => setDeleteConfirm(c.id)}
                        title="Remove credential"
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                        <span className="sr-only">Remove</span>
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </ScrollArea>

      <Separator />
      <p className="px-3 py-1.5 text-[10px] text-muted-foreground">
        All credentials are encrypted with AES-256-GCM before storage.
      </p>
    </div>
  );
}

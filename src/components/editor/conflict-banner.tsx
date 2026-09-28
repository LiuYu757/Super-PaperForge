'use client';

import { useEffect, useState } from 'react';
import { AlertTriangleIcon, CloudDownloadIcon, DownloadIcon, RefreshCwIcon, ShieldCheckIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEditorStore } from '@/store/editor-store';
import {
  resolveConflictWithRemote,
  authorizeInformedOverwrite,
  saveTabVersioned,
} from '@/lib/editor-save';
import { saveBlobAs } from '@/lib/api-client';
import { toast } from 'sonner';

/**
 * Conflict resolution UI (review N07 / PR-B).
 *
 * When a save is refused with 409/412/428 the tab enters `status: 'conflict'`
 * and auto-upload stops. This banner is the ONLY sanctioned way out of that
 * state — every button is an explicit, confirmed user decision:
 *
 *  - “Use server version”  — discards the local body and rebases onto the
 *    server content (the user has just been shown it).
 *  - “Keep my version”     — an informed overwrite: the next save is a
 *    conditional PUT against the server hash the user just reviewed.
 *  - “Download my draft”   — local copy to disk; the conflict stays.
 *
 * The client never swaps the base hash on its own: rebasing without review
 * would let stale local bytes pass the next conditional check.
 */
export function ConflictBanner({ projectId }: { projectId: string }) {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTab = useEditorStore((s) => s.activeTab);
  const tab = tabs.find((t) => t.path === activeTab);
  const [showRemote, setShowRemote] = useState(false);

  useEffect(() => {
    setShowRemote(false);
  }, [activeTab, tab?.status]);

  if (!tab || tab.status !== 'conflict') return null;

  const remoteSha = tab.remote?.sha256 ?? null;

  async function handleUseServer() {
    const confirmed = window.confirm(
      `Replace your local edits to "${tab!.path}" with the current server version? ` +
      'Your unsaved local changes will be discarded.',
    );
    if (!confirmed) return;
    const ok = await resolveConflictWithRemote(projectId, tab!.path);
    toast[ok ? 'success' : 'error'](
      ok ? 'Loaded the server version' : 'Could not load the server version',
    );
  }

  async function handleKeepMine() {
    const confirmed = window.confirm(
      `Overwrite the server version of "${tab!.path}" with your local draft? ` +
      'You are replacing changes made on the server with the draft shown in your editor.',
    );
    if (!confirmed) return;
    const ok = await authorizeInformedOverwrite(projectId, tab!.path);
    if (!ok) {
      toast.error('Could not read the current server version — not overwriting');
      return;
    }
    const outcome = await saveTabVersioned(projectId, tab!.path);
    if (outcome === 'saved') toast.success('Your version was saved');
    else toast.error('Overwrite was not accepted — the file may have changed again');
  }

  function handleDownloadDraft() {
    saveBlobAs(
      new Blob([tab!.content], { type: 'text/plain' }),
      (tab!.path.split('/').pop() ?? 'draft') + '.local.txt',
    );
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex flex-col gap-2 border-b bg-red-500/10 px-4 py-2 text-xs text-red-700 dark:text-red-300"
    >
      <div className="flex flex-wrap items-center gap-2">
        <AlertTriangleIcon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="font-medium">
          Conflict: “{tab.path}” changed on the server since you loaded it.
        </span>
        <span className="text-muted-foreground">
          Auto-save is paused for this file until you choose how to proceed.
          {remoteSha
            ? ` Server version: ${remoteSha.slice(0, 12)}…`
            : ' (Server version could not be read.)'}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <Button
            size="xs"
            variant="outline"
            onClick={() => setShowRemote((v) => !v)}
            aria-expanded={showRemote}
          >
            <CloudDownloadIcon className="size-3" />
            {showRemote ? 'Hide server version' : 'Show server version'}
          </Button>
          <Button size="xs" variant="outline" onClick={() => void handleUseServer()}>
            <RefreshCwIcon className="size-3" />
            Use server version
          </Button>
          <Button size="xs" variant="outline" onClick={() => void handleKeepMine()}>
            <ShieldCheckIcon className="size-3" />
            Keep my version
          </Button>
          <Button size="xs" variant="outline" onClick={handleDownloadDraft}>
            <DownloadIcon className="size-3" />
            My draft
          </Button>
        </div>
      </div>
      {showRemote && (
        <pre className="max-h-48 overflow-auto rounded border bg-background p-2 text-[11px] leading-relaxed text-foreground">
          {tab.remote?.content ?? 'Server content unavailable — reload the file to see it.'}
        </pre>
      )}
    </div>
  );
}

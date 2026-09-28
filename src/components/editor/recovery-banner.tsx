'use client';

import { useState, useEffect } from 'react';
import { AlertTriangleIcon, CheckIcon, DownloadIcon, Trash2Icon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEditorStore } from '@/store/editor-store';
import {
  draftStorageSupported,
  listQuarantinedDrafts,
  removeQuarantinedDraft,
  type LegacyDraft,
} from '@/lib/draft-storage';
import { saveBlobAs } from '@/lib/api-client';
import { toast } from 'sonner';

/**
 * Crash-recovery UI (review N03 / PR-A).
 *
 * Two separate recovery sources, with different trust levels:
 *
 *  1. Verified drafts — full content restored from IndexedDB under the
 *     instance/user/project/fileId scope, with a matching integrity digest.
 *     They come back as `status: 'recoveryUnverified'` tabs: shown and
 *     editable, but NOT auto-uploaded. "Restore & save" is the explicit
 *     confirmation that turns them back into normal dirty tabs.
 *
 *  2. Quarantined legacy drafts — the pre-migration localStorage tabs. They
 *     may be truncated and carry no user/project/file identity, so they are
 *     DOWNLOAD-ONLY: they are never attached to a current same-named file
 *     and never uploaded. The old "Save All" button (which blindly pushed
 *     possibly-truncated bodies to the server) is gone.
 */
export function RecoveryBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [legacy, setLegacy] = useState<LegacyDraft[]>([]);
  const tabs = useEditorStore((s) => s.tabs);

  // Load the quarantined legacy drafts once.
  useEffect(() => {
    if (!draftStorageSupported()) return;
    void listQuarantinedDrafts().then(setLegacy);
  }, []);

  const recoverable = tabs.filter((t) => t.status === 'recoveryUnverified');
  const show = !dismissed && (recoverable.length > 0 || legacy.length > 0);
  if (!show) return null;

  function handleRestoreAll() {
    const store = useEditorStore.getState();
    for (const tab of store.tabs) {
      if (tab.status === 'recoveryUnverified') store.confirmRecovery(tab.path);
    }
    toast.success('Recovered drafts restored — saving…');
    // Let the editor layout flush a save for the newly confirmed tabs.
    window.dispatchEvent(new CustomEvent('trigger-autosave'));
  }

  function handleDiscard(path: string) {
    useEditorStore.getState().closeTab(path);
  }

  function handleDownloadDraft(d: LegacyDraft) {
    saveBlobAs(
      new Blob([d.content], { type: 'text/plain' }),
      (d.path.split('/').pop() || 'draft') + '.recovery.txt',
    );
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex flex-col gap-2 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
    >
      <div className="flex flex-wrap items-center gap-2">
        <AlertTriangleIcon className="size-3.5 shrink-0" aria-hidden="true" />
        {recoverable.length > 0 && (
          <span>
            Recovered {recoverable.length} unsaved{' '}
            {recoverable.length === 1 ? 'file' : 'files'} from your last session (not yet
            uploaded)
          </span>
        )}
        {recoverable.length === 0 && legacy.length > 0 && (
          <span>Older local drafts from a previous version were found (read-only)</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {recoverable.length > 0 && (
            <Button
              size="xs"
              variant="outline"
              onClick={handleRestoreAll}
              className="h-5 border-amber-300 bg-amber-100 px-2 text-[10px] font-medium text-amber-800 hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-900/50 dark:text-amber-300 dark:hover:bg-amber-900"
            >
              <CheckIcon className="size-3" />
              Restore &amp; save
            </Button>
          )}
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss recovery notification"
          >
            <XIcon className="size-3" />
          </Button>
        </div>
      </div>

      {/* Recovered tabs awaiting confirmation */}
      {recoverable.length > 0 && (
        <ul className="flex flex-col gap-1 pl-6">
          {recoverable.map((t) => (
            <li key={t.path} className="flex items-center gap-2">
              <span className="truncate font-mono">{t.path}</span>
              <span className="text-amber-700/70 dark:text-amber-400/70">
                ({t.content.length.toLocaleString()} chars — verify before upload)
              </span>
              <button
                type="button"
                onClick={() => handleDownloadDraft({ key: t.path, path: t.path, content: t.content, baseSha256: null, savedAt: 0 })}
                className="ml-auto rounded p-0.5 hover:bg-amber-200 dark:hover:bg-amber-900"
                aria-label={`Download local draft of ${t.path}`}
                title="Download this draft"
              >
                <DownloadIcon className="size-3" />
              </button>
              <button
                type="button"
                onClick={() => handleDiscard(t.path)}
                className="rounded p-0.5 hover:bg-amber-200 dark:hover:bg-amber-900"
                aria-label={`Discard recovered draft of ${t.path}`}
                title="Discard this draft"
              >
                <Trash2Icon className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Quarantined legacy drafts: download-only, never auto-uploaded */}
      {legacy.length > 0 && (
        <div className="pl-6">
          <p className="mb-1 text-amber-700/80 dark:text-amber-400/80">
            Drafts saved by an older version (possibly truncated, unknown identity) — download
            only, they will not be uploaded:
          </p>
          <ul className="flex flex-col gap-1">
            {legacy.map((d) => (
              <li key={d.key} className="flex items-center gap-2">
                <span className="truncate font-mono">{d.path}</span>
                <span className="text-amber-700/60 dark:text-amber-400/60">
                  ({d.content.length.toLocaleString()} chars)
                </span>
                <button
                  type="button"
                  onClick={() => handleDownloadDraft(d)}
                  className="ml-auto rounded p-0.5 hover:bg-amber-200 dark:hover:bg-amber-900"
                  aria-label={`Download legacy draft of ${d.path}`}
                  title="Download"
                >
                  <DownloadIcon className="size-3" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void removeQuarantinedDraft(d.key).then(() =>
                      setLegacy((prev) => prev.filter((x) => x.key !== d.key)),
                    );
                  }}
                  className="rounded p-0.5 hover:bg-amber-200 dark:hover:bg-amber-900"
                  aria-label={`Remove legacy draft of ${d.path}`}
                  title="Remove"
                >
                  <Trash2Icon className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

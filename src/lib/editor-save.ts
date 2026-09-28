'use client';

import { useEditorStore, type RemoteFileState } from '@/store/editor-store';
import { ApiClientError, putFileText, fetchFileText } from '@/lib/api-client';

/**
 * PR-B versioned save protocol (reviews N07 / N12).
 *
 * Every save carries the SHA-256 baseline the tab was loaded or last committed
 * against, so the server can reject a stale overwrite atomically (412/409/428).
 *
 * Additional invariants enforced here:
 *  - **One in-flight save per file.** Repeat clicks and the auto-save timer
 *    must never produce two concurrent PUTs for the same path; a second
 *    caller awaits the SAME promise instead of issuing a new request.
 *  - **Conflicts are terminal for auto-upload.** A 412/409/428 moves the tab
 *    to `status: 'conflict'` with the original baseline INTACT. The client
 *    never adopts the server hash on its own — rebasing without merging would
 *    let stale local bytes pass the next conditional check and silently
 *    overwrite someone else's edits (the exact flow review N07 forbids).
 *    Resolution is an explicit user action (see the conflict banner).
 *  - **Responses are identity-checked.** A success updates the tab only with
 *    the server-returned hash/revision; the tab's edit sequence binds the
 *    commit to the exact content that was sent (a keystroke that lands while
 *    the request is in flight keeps the tab dirty).
 */
export type SaveOutcome = 'saved' | 'conflict' | 'failed';

/** In-flight save per file path — the single-flight registry. */
const inflightSaves = new Map<string, Promise<SaveOutcome>>();

/** Test hook: clear the single-flight registry between cases. */
export function __resetInflightSaves(): void {
  inflightSaves.clear();
}

export function saveTabVersioned(projectId: string, path: string): Promise<SaveOutcome> {
  const existing = inflightSaves.get(path);
  if (existing) return existing;

  const run = (async (): Promise<SaveOutcome> => {
    const state = useEditorStore.getState();
    const tab = state.tabs.find((t) => t.path === path);
    if (!tab) return 'failed';

    // Conflicted tabs never re-enter auto-upload; the user must resolve
    // first. (Unverified recovery drafts likewise wait for confirmation.)
    if (tab.status === 'conflict' || tab.status === 'recoveryUnverified') {
      return 'conflict';
    }

    // Snapshot the state right before sending: `sentSeq` is the edit sequence
    // the request commits, so a keystroke that lands while it is in flight
    // (editSeq > sentSeq) keeps the tab dirty after markSaved — it was never
    // part of the committed content.
    const baseline = tab.baseSha256;
    const sentSeq = tab.editSeq;
    const sentContent = tab.content;

    useEditorStore.getState().markSaving(path);
    try {
      const data = await putFileText(projectId, path, {
        content: sentContent,
        baseSha256: baseline,
      });
      useEditorStore.getState().markSaved(
        path,
        data.sha256,
        data.revision,
        sentSeq,
      );
      return 'saved';
    } catch (err) {
      if (err instanceof ApiClientError && (err.status === 412 || err.status === 428 || err.status === 409)) {
        // Keep the local draft AND the original baseline. Fetch the remote
        // state so the conflict UI can show what changed — but do NOT touch
        // the tab's own content or hash. Resolution stays explicit.
        let remote: RemoteFileState | null = null;
        try {
          const current = await fetchFileText(projectId, path);
          remote = { content: current.content, sha256: current.sha256 };
        } catch {
          remote = null; // remote read failed — the banner offers a manual retry
        }
        useEditorStore.getState().markConflict(path, remote);
        return 'conflict';
      }
      console.error('Save error:', err);
      useEditorStore.getState().markSaveFailed(path);
      return 'failed';
    }
  })();

  // Always unregister — including on rejection paths that throw through.
  const tracked = run.finally(() => {
    inflightSaves.delete(path);
  });
  inflightSaves.set(path, tracked);
  return tracked;
}

/**
 * Explicit conflict resolution #1 ("use server version"): the caller (the
 * conflict banner, after a user click) has decided to discard the local body
 * and rebase onto the server version. Fetches the remote state and replaces
 * the tab. Never invoked automatically.
 */
export async function resolveConflictWithRemote(
  projectId: string,
  path: string,
): Promise<boolean> {
  try {
    const current = await fetchFileText(projectId, path);
    useEditorStore.getState().resolveConflictWithRemote(path, {
      content: current.content,
      sha256: current.sha256,
    });
    return true;
  } catch (err) {
    console.error('Conflict resolution failed:', err);
    return false;
  }
}

/**
 * Explicit conflict resolution #2 ("keep my version"): fetches the server's
 * CURRENT hash so the next save is an informed conditional overwrite of a
 * version the user was just shown. The tab stays dirty until that save runs —
 * nothing is committed here.
 */
export async function authorizeInformedOverwrite(
  projectId: string,
  path: string,
): Promise<boolean> {
  try {
    const current = await fetchFileText(projectId, path);
    useEditorStore.getState().authorizeInformedOverwrite(path, current.sha256);
    return true;
  } catch (err) {
    console.error('Conflict resolution failed:', err);
    return false;
  }
}

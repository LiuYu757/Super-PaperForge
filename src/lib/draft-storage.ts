'use client';

/**
 * Crash-recovery draft storage (review N03 / PR-A).
 *
 * The previous implementation persisted tab content through zustand's
 * localStorage middleware with `content.slice(0, 50000)` while KEEPING the
 * full-length `baseSha256`. After a refresh, a 60,000-character manuscript
 * restored as its first 50,000 characters but still passed the server's
 * conditional-write check — silently truncating the committed document. The
 * key was also a single global `paperforge-editor`, mixing drafts across
 * users, projects and service instances.
 *
 * This module stores FULL content in IndexedDB with:
 *  - identity scoping: instanceId (deployment origin) / userId / projectId /
 *    fileId — the path is display metadata only, so a same-named `main.tex` in
 *    another project can never collide;
 *  - an integrity digest (SHA-256 of the exact stored bytes) verified on load —
 *    a corrupt or truncated draft is discarded, never served as "recoverable";
 *  - an explicit "recovery unavailable" failure mode: when local storage
 *    fails (quota exceeded), the caller surfaces it. A truncated copy is never
 *    written in place of a full one.
 *
 * Legacy drafts (the old localStorage format, possibly truncated, no user /
 * project / file identity) are migrated into a quarantine scope and marked
 * `untrusted`: they are offered for download only and are never auto-uploaded
 * or attached to a same-named current file.
 */

export interface DraftScope {
  instanceId: string;
  userId: string;
  projectId: string;
}

export interface DraftRecord {
  instanceId: string;
  userId: string;
  projectId: string;
  /** Stable server file id — identity, not path. */
  fileId: string;
  /** Display metadata only; the recovery identity is fileId. */
  path: string;
  content: string;
  baseSha256: string | null;
  editSeq: number;
  savedSeq: number;
  /** SHA-256 of `content`, recomputed on load to detect corruption. */
  contentSha256: string;
  savedAt: number;
  protocolVersion: 2;
  complete: true;
}

/** Quarantined legacy draft — offered for download, never auto-uploaded. */
export interface LegacyDraft {
  key: string;
  path: string;
  content: string;
  baseSha256: string | null;
  savedAt: number;
}

const DB_NAME = 'paperforge-drafts';
const DB_VERSION = 1;
const STORE_DRAFTS = 'drafts';
const STORE_LEGACY = 'legacyDrafts';

/** Scope used to quarantine pre-migration localStorage drafts. */
export const LEGACY_SCOPE: DraftScope = {
  instanceId: 'legacy',
  userId: 'legacy',
  projectId: 'legacy',
};

export function draftStorageSupported(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_DRAFTS)) {
        db.createObjectStore(STORE_DRAFTS, {
          keyPath: ['instanceId', 'userId', 'projectId', 'fileId'],
        });
      }
      if (!db.objectStoreNames.contains(STORE_LEGACY)) {
        db.createObjectStore(STORE_LEGACY, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
}

/** SHA-256 hex digest of a UTF-8 string, via WebCrypto. */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export type SaveDraftsResult = { ok: true } | { ok: false; reason: string };

/**
 * Persist the full content of several drafts in one IndexedDB transaction.
 * Full content or nothing — on quota failure the caller is told recovery is
 * unavailable instead of silently keeping a truncated copy.
 */
export async function saveDrafts(
  scope: DraftScope,
  drafts: Array<Omit<DraftRecord, 'instanceId' | 'userId' | 'projectId' | 'savedAt' | 'contentSha256' | 'protocolVersion' | 'complete'>>,
): Promise<SaveDraftsResult> {
  if (!draftStorageSupported()) {
    return { ok: false, reason: 'IndexedDB unavailable in this browser' };
  }
  try {
    const db = await openDb();
    const savedAt = Date.now();
    const records: DraftRecord[] = await Promise.all(
      drafts.map(async (d) => ({
        ...scope,
        fileId: d.fileId,
        path: d.path,
        content: d.content,
        baseSha256: d.baseSha256,
        editSeq: d.editSeq,
        savedSeq: d.savedSeq,
        contentSha256: await sha256Hex(d.content),
        savedAt,
        protocolVersion: 2 as const,
        complete: true as const,
      })),
    );
    return await new Promise<SaveDraftsResult>((resolve, reject) => {
      const tx = db.transaction(STORE_DRAFTS, 'readwrite');
      const store = tx.objectStore(STORE_DRAFTS);
      for (const record of records) {
        store.put(record);
      }
      tx.oncomplete = () => resolve({ ok: true });
      tx.onerror = () => {
        const err = tx.error;
        reject(
          err?.name === 'QuotaExceededError'
            ? new Error('Local storage quota exceeded — crash recovery is now unavailable')
            : (err ?? new Error('Failed to persist drafts')),
        );
      };
      tx.onabort = () => reject(tx.error ?? new Error('Draft persistence aborted'));
    });
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/** All drafts for a scope whose stored digest still matches their content. */
export async function loadDrafts(scope: DraftScope): Promise<DraftRecord[]> {
  if (!draftStorageSupported()) return [];
  try {
    const db = await openDb();
    const all = await new Promise<DraftRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_DRAFTS, 'readonly');
      const req = tx.objectStore(STORE_DRAFTS).getAll();
      req.onsuccess = () => resolve(req.result as DraftRecord[]);
      req.onerror = () => reject(req.error ?? new Error('getAll failed'));
    });
    const verified: DraftRecord[] = [];
    for (const record of all) {
      if (
        record.instanceId !== scope.instanceId ||
        record.userId !== scope.userId ||
        record.projectId !== scope.projectId
      ) {
        continue;
      }
      // Integrity check: a draft that fails its own digest is corrupt — drop
      // it instead of restoring a possibly truncated body with a stale hash.
      if (record.protocolVersion !== 2 || !record.complete) continue;
      if ((await sha256Hex(record.content)) !== record.contentSha256) continue;
      verified.push(record);
    }
    return verified;
  } catch {
    return [];
  }
}

/** Remove drafts (e.g. after a tab was closed or fully committed). */
export async function deleteDrafts(scope: DraftScope, fileIds: string[]): Promise<void> {
  if (!draftStorageSupported() || fileIds.length === 0) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_DRAFTS, 'readwrite');
      const store = tx.objectStore(STORE_DRAFTS);
      for (const fileId of fileIds) {
        store.delete([scope.instanceId, scope.userId, scope.projectId, fileId]);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('delete failed'));
    });
  } catch {
    // best effort — a stale draft is verified against identity on load
  }
}

const LEGACY_KEY = 'paperforge-editor';

/** Read (once) the tabs persisted by the OLD localStorage format. */
export function readLegacyDrafts(): LegacyDraft[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as {
      state?: { tabs?: Array<Record<string, unknown>> };
      tabs?: Array<Record<string, unknown>>;
    };
    const tabs = parsed.state?.tabs ?? parsed.tabs ?? [];
    const savedAt = Date.now();
    return tabs.map((t, i) => ({
      key: `legacy-${i}-${savedAt}`,
      path: typeof t.path === 'string' ? t.path : `unknown-${i}`,
      content: typeof t.content === 'string' ? t.content : '',
      baseSha256: typeof t.baseSha256 === 'string' ? t.baseSha256 : null,
      savedAt,
    }));
  } catch {
    return [];
  }
}

/**
 * Move legacy localStorage drafts into the quarantine scope (IndexedDB) and
 * strip the tabs from the localStorage entry so they can never be restored as
 * editable tabs again. Quarantined drafts are download-only.
 */
export async function quarantineLegacyDrafts(): Promise<LegacyDraft[]> {
  const legacy = readLegacyDrafts();
  if (legacy.length > 0 && draftStorageSupported()) {
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_LEGACY, 'readwrite');
        const store = tx.objectStore(STORE_LEGACY);
        for (const d of legacy) store.put(d);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('legacy store failed'));
      });
    } catch {
      // If quarantining fails, we still strip localStorage below — the drafts
      // are lossy copies anyway and must not silently become editable again.
    }
  }
  // Strip tabs/activeTab from the old localStorage entry (keep preferences).
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        state?: Record<string, unknown>;
      };
      if (parsed.state) {
        delete parsed.state.tabs;
        delete parsed.state.activeTab;
        window.localStorage.setItem(LEGACY_KEY, JSON.stringify(parsed));
      }
    }
  } catch {
    // unreadable/corrupt entry — remove it entirely rather than restore junk
    try { window.localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
  }
  return legacy;
}

/** List quarantined legacy drafts (for the download-only recovery banner). */
export async function listQuarantinedDrafts(): Promise<LegacyDraft[]> {
  if (!draftStorageSupported()) return [];
  try {
    const db = await openDb();
    return await new Promise<LegacyDraft[]>((resolve, reject) => {
      const tx = db.transaction(STORE_LEGACY, 'readonly');
      const req = tx.objectStore(STORE_LEGACY).getAll();
      req.onsuccess = () => resolve(req.result as LegacyDraft[]);
      req.onerror = () => reject(req.error ?? new Error('getAll failed'));
    });
  } catch {
    return [];
  }
}

/** Remove a quarantined draft after the user downloaded or discarded it. */
export async function removeQuarantinedDraft(key: string): Promise<void> {
  if (!draftStorageSupported()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_LEGACY, 'readwrite');
      tx.objectStore(STORE_LEGACY).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('delete failed'));
    });
  } catch { /* best effort */ }
}

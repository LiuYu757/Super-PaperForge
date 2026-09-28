import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Editor state with the PR-B versioned-editing protocol.
 *
 * Every tab tracks:
 *  - `fileId`   — the server-side identity of the file (stable across renames);
 *  - `baseSha256` — the SHA-256 of the server version the tab is based on
 *    (null ⇒ the file has never been committed by this tab, saves are
 *    create-only);
 *  - `editSeq/savedSeq` — a monotonic local edit counter and the sequence
 *    bound to the last successful commit, so a keystroke that lands while a
 *    save is in flight is never marked clean;
 *  - `status`   — the explicit workflow state (review N07/N12):
 *      clean               committed, nothing pending
 *      dirty               local edits not yet saved
 *      saving              a save request is in flight (one per file)
 *      conflict            the server refused a stale write; auto-upload is
 *                          STOPPED until the user explicitly resolves
 *      error               transport/5xx failure; retry allowed
 *      recoveryUnverified  restored from a local crash-recovery draft; it is
 *                          NOT auto-uploaded until the user confirms it
 *
 * Tabs are no longer persisted through zustand's localStorage middleware: the
 * old `content.slice(0, 50000)` truncation could silently corrupt a restored
 * manuscript while keeping its full-length `baseSha256` (review N03), and a
 * single global `paperforge-editor` key mixed drafts across users, projects
 * and instances. Full-content crash recovery now lives in IndexedDB, scoped by
 * instance/user/project/fileId (see src/lib/draft-storage.ts); only UI
 * preferences are persisted here.
 */
export type TabStatus =
  | 'clean'
  | 'dirty'
  | 'saving'
  | 'conflict'
  | 'error'
  | 'recoveryUnverified';

/** Server-side state captured when a conflict was detected. */
export interface RemoteFileState {
  content: string;
  sha256: string;
}

export interface EditorTab {
  path: string;
  /** Stable server file id; null for never-committed local drafts. */
  fileId: string | null;
  content: string;
  dirty: boolean;
  language?: string;
  /** SHA-256 of the server version this tab is based on (null: not yet created). */
  baseSha256: string | null;
  /** Monotonic per-tab edit counter; every local change increments it. */
  editSeq: number;
  /** editSeq at the moment of the last successful commit. */
  savedSeq: number;
  /** Project revision returned by the last successful save. */
  lastKnownRevision: string | null;
  /** Explicit workflow state — see the module comment. */
  status: TabStatus;
  /** Server content observed during a conflict (for explicit resolution). */
  remote: RemoteFileState | null;
}

interface EditorState {
  tabs: EditorTab[];
  activeTab: string | null;
  compilationLog: string;
  compilationStatus: 'idle' | 'compiling' | 'success' | 'error';
  compilationDuration: number | null;
  latestPdfUrl: string | null;
  autoCompileEnabled: boolean;
  autoSaveEnabled: boolean;
  sidebarCollapsed: boolean;
  logPanelCollapsed: boolean;
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  wordWrap: boolean;
  showLineNumbers: boolean;
  cursorLine: number;
  cursorCol: number;
  selectionLength: number;

  openFile: (
    path: string,
    content: string,
    baseSha256?: string | null,
    fileId?: string | null,
  ) => void;
  closeTab: (path: string) => void;
  closeOtherTabs: (path: string) => void;
  closeAllTabs: () => void;
  setActiveTab: (path: string) => void;
  renameTab: (oldPath: string, newPath: string, fileId?: string | null) => void;
  updateContent: (path: string, content: string) => void;
  markSaving: (path: string) => void;
  markSaved: (path: string, sha256: string | null, revision?: string | null, sentSeq?: number) => void;
  markConflict: (path: string, remote?: RemoteFileState | null) => void;
  markSaveFailed: (path: string) => void;
  refreshCleanTab: (path: string, expectedSha256: string | null,
    content: string, sha256: string, revision: string) => void;
  /**
   * Explicit, user-confirmed resolution: replace the local body with the
   * server version and rebase onto it. Never called automatically.
   */
  resolveConflictWithRemote: (path: string, remote: RemoteFileState) => void;
  /**
   * Explicit, user-confirmed resolution: the user has reviewed the remote
   * version and chooses to overwrite it with the local body. The next save
   * becomes an informed conditional PUT against `currentServerSha256`.
   */
  authorizeInformedOverwrite: (path: string, currentServerSha256: string) => void;
  /** Confirm a restored recovery draft so auto-save may pick it up again. */
  confirmRecovery: (path: string) => void;
  /** Bulk-restore crash-recovery drafts (status recoveryUnverified, dirty). */
  recoverTabs: (drafts: Array<{
    path: string;
    fileId: string;
    content: string;
    baseSha256: string | null;
    editSeq: number;
    savedSeq: number;
  }>) => void;
  setCompilationLog: (log: string) => void;
  setCompilationStatus: (status: EditorState['compilationStatus']) => void;
  setCompilationDuration: (duration: number | null) => void;
  setLatestPdfUrl: (url: string | null) => void;
  toggleAutoCompile: () => void;
  toggleAutoSave: () => void;
  toggleSidebar: () => void;
  toggleLogPanel: () => void;
  setFontSize: (size: number) => void;
  setLineHeight: (height: number) => void;
  setFontFamily: (family: string) => void;
  setWordWrap: (enabled: boolean) => void;
  setShowLineNumbers: (enabled: boolean) => void;
  setCursorPosition: (line: number, col: number, selLen?: number) => void;
  hasUnsavedChanges: () => boolean;
  reorderTab: (fromIndex: number, toIndex: number) => void;
}

// Detect file language from extension
function detectLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'tex':
    case 'cls':
    case 'sty':
      return 'latex';
    case 'bib':
      return 'bibtex';
    case 'md':
      return 'markdown';
    case 'json':
      return 'json';
    case 'yaml':
    case 'yml':
      return 'yaml';
    case 'txt':
      return 'text';
    default:
      return 'text';
  }
}

function tabFrom(path: string, content: string, baseSha256: string | null, fileId: string | null): EditorTab {
  return {
    path,
    fileId,
    content,
    dirty: false,
    language: detectLanguage(path),
    baseSha256,
    editSeq: 0,
    savedSeq: 0,
    lastKnownRevision: null,
    status: 'clean',
    remote: null,
  };
}

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
  tabs: [],
  activeTab: null,
  compilationLog: '',
  compilationStatus: 'idle',
  compilationDuration: null,
  latestPdfUrl: null,
  autoCompileEnabled: true,
  autoSaveEnabled: true,
  sidebarCollapsed: false,
  logPanelCollapsed: false,
  fontSize: 14,
  lineHeight: 1.6,
  fontFamily: 'var(--font-mono, monospace)',
  wordWrap: true,
  showLineNumbers: true,
  cursorLine: 1,
  cursorCol: 1,
  selectionLength: 0,

  openFile: (path, content, baseSha256 = null, fileId = null) => set((state) => {
    const existing = state.tabs.find((t) => t.path === path);
    if (existing) return { activeTab: path };
    return {
      tabs: [...state.tabs, tabFrom(path, content, baseSha256, fileId)],
      activeTab: path,
    };
  }),

  closeTab: (path) => set((state) => {
    const idx = state.tabs.findIndex((t) => t.path === path);
    const tabs = state.tabs.filter((t) => t.path !== path);
    let nextActive = state.activeTab;
    if (state.activeTab === path) {
      // Activate the nearest tab (prefer the one to the left, fallback to right)
      nextActive = tabs[Math.min(idx, tabs.length - 1)]?.path || null;
    }
    return { tabs, activeTab: nextActive };
  }),

  closeOtherTabs: (path) => set((state) => ({
    tabs: state.tabs.filter((t) => t.path === path),
    activeTab: path,
  })),

  closeAllTabs: () => set({ tabs: [], activeTab: null }),

  setActiveTab: (path) => set({ activeTab: path }),

  /** Server-side rename: move the tab to the new path, keeping every bit of
   * local state (dirty content, edit sequence, baseline, conflict info). */
  renameTab: (oldPath, newPath, fileId) => set((state) => ({
    tabs: state.tabs.map((t) =>
      t.path === oldPath
        ? {
            ...t,
            path: newPath,
            language: detectLanguage(newPath),
            fileId: fileId ?? t.fileId,
          }
        : t,
    ),
    activeTab: state.activeTab === oldPath ? newPath : state.activeTab,
  })),

  updateContent: (path, content) => set((state) => ({
    tabs: state.tabs.map((t) =>
      // The hash baseline stays unchanged while the user types — the next save
      // still proves "I based my edit on the version I read" (or the version
      // established by the last commit). Typing after a conflict keeps the
      // conflict status: the file must not silently re-enter auto-upload.
      t.path === path
        ? {
            ...t,
            content,
            dirty: true,
            editSeq: t.editSeq + 1,
            status: t.status === 'conflict' ? 'conflict' : t.status === 'saving' ? 'saving' : 'dirty',
          }
        : t,
    ),
  })),

  markSaving: (path) => set((state) => ({
    tabs: state.tabs.map((t) =>
      t.path === path && t.dirty
        ? { ...t, status: 'saving' }
        : t,
    ),
  })),

  markSaved: (path, sha256, revision = null, sentSeq) => set((state) => ({
    tabs: state.tabs.map((t) => {
      if (t.path !== path) return t;
      if (t.status === 'conflict') return t;
      // Bind the commit to the edit sequence that was SENT, not the one current
      // at response time: a keystroke that landed while the request was in
      // flight (editSeq > sentSeq) leaves the tab dirty — it was never part of
      // the committed content.
      const bound = sentSeq ?? t.editSeq;
      const stillDirty = t.editSeq > bound;
      return {
        ...t,
        dirty: stillDirty,
        savedSeq: bound,
        baseSha256: sha256 ?? t.baseSha256,
        lastKnownRevision: revision ?? t.lastKnownRevision,
        status: stillDirty ? 'dirty' : 'clean',
        remote: null,
      };
    }),
  })),

  /** A 409/412/428 outcome: keep the local draft and the ORIGINAL baseline.
   * Auto-upload stops here; resolution is an explicit user action. Never just
   * swap the base hash — that would let stale bytes pass the next check. */
  markConflict: (path, remote = null) => set((state) => ({
    tabs: state.tabs.map((t) =>
      t.path === path ? { ...t, status: 'conflict', dirty: true, remote: remote ?? t.remote } : t,
    ),
  })),

  markSaveFailed: (path) => set((state) => ({
    tabs: state.tabs.map((t) =>
      t.path === path ? { ...t, status: 'error', dirty: true } : t,
    ),
  })),

  refreshCleanTab: (path, expectedSha256, content, sha256, revision) => set((state) => ({
    tabs: state.tabs.map((tab) => tab.path === path && tab.status === 'clean'
      && !tab.dirty && tab.baseSha256 === expectedSha256
      ? { ...tab, content, baseSha256: sha256, lastKnownRevision: revision,
          editSeq: tab.editSeq + 1, savedSeq: tab.editSeq + 1 }
      : tab),
  })),

  resolveConflictWithRemote: (path, remote) => set((state) => ({
    tabs: state.tabs.map((t) => {
      if (t.path !== path) return t;
      return {
        ...t,
        content: remote.content,
        baseSha256: remote.sha256,
        editSeq: t.editSeq + 1,
        savedSeq: t.editSeq + 1,
        dirty: false,
        status: 'clean',
        remote: null,
      };
    }),
  })),

  authorizeInformedOverwrite: (path, currentServerSha256) => set((state) => ({
    tabs: state.tabs.map((t) =>
      t.path === path
        ? { ...t, status: 'dirty', dirty: true, baseSha256: currentServerSha256, remote: null }
        : t,
    ),
  })),

  confirmRecovery: (path) => set((state) => ({
    tabs: state.tabs.map((t) =>
      t.path === path && t.status === 'recoveryUnverified'
        ? { ...t, status: 'dirty' }
        : t,
    ),
  })),

  recoverTabs: (drafts) => set((state) => {
    // Only restore a draft whose file still exists in this project (identity
    // is fileId, not path — a same-named file in another project can never
    // match) and that is not already open.
    const restored: EditorTab[] = [];
    for (const d of drafts) {
      if (state.tabs.some((t) => t.fileId === d.fileId || t.path === d.path)) continue;
      restored.push({
        path: d.path,
        fileId: d.fileId,
        content: d.content,
        dirty: true,
        language: detectLanguage(d.path),
        baseSha256: d.baseSha256,
        editSeq: Math.max(d.editSeq, d.savedSeq, 1),
        savedSeq: d.savedSeq,
        lastKnownRevision: null,
        // Unverified: the server may have moved on; the draft is NOT
        // auto-uploaded until the user confirms it in the recovery banner.
        status: 'recoveryUnverified',
        remote: null,
      });
    }
    if (restored.length === 0) return {};
    return {
      tabs: [...state.tabs, ...restored],
      activeTab: state.activeTab ?? restored[0].path,
    };
  }),

  setCompilationLog: (log) => set({ compilationLog: log }),
  setCompilationStatus: (status) => set({ compilationStatus: status }),
  setCompilationDuration: (duration) => set({ compilationDuration: duration }),
  setLatestPdfUrl: (url) => set({ latestPdfUrl: url }),
  toggleAutoCompile: () => set((state) => ({ autoCompileEnabled: !state.autoCompileEnabled })),
  toggleAutoSave: () => set((state) => ({ autoSaveEnabled: !state.autoSaveEnabled })),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  toggleLogPanel: () => set((state) => ({ logPanelCollapsed: !state.logPanelCollapsed })),
  setFontSize: (size) => set({ fontSize: size }),
  setLineHeight: (height) => set({ lineHeight: height }),
  setFontFamily: (family) => set({ fontFamily: family }),
  setWordWrap: (enabled) => set({ wordWrap: enabled }),
  setShowLineNumbers: (enabled) => set({ showLineNumbers: enabled }),
  setCursorPosition: (line, col, selLen = 0) => set({ cursorLine: line, cursorCol: col, selectionLength: selLen }),

  hasUnsavedChanges: () => get().tabs.some((t) => t.dirty),

  reorderTab: (fromIndex, toIndex) => set((state) => {
    const tabs = [...state.tabs];
    const [moved] = tabs.splice(fromIndex, 1);
    tabs.splice(toIndex, 0, moved);
    return { tabs };
  }),
    }),
    {
      name: 'paperforge-editor',
      // ONLY UI preferences are persisted (review N03): tab content used to be
      // truncated at 50,000 chars while keeping the full-length baseSha256,
      // and the single global key mixed drafts across users/projects.
      // Crash-recovery content now lives in IndexedDB, scoped by
      // instance/user/project/fileId — see src/lib/draft-storage.ts.
      partialize: (state) => ({
        fontSize: state.fontSize,
        lineHeight: state.lineHeight,
        fontFamily: state.fontFamily,
        wordWrap: state.wordWrap,
        showLineNumbers: state.showLineNumbers,
        autoCompileEnabled: state.autoCompileEnabled,
        autoSaveEnabled: state.autoSaveEnabled,
        sidebarCollapsed: state.sidebarCollapsed,
        logPanelCollapsed: state.logPanelCollapsed,
      }),
    }
  )
);

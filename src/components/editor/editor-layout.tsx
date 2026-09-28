'use client';

import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { FileIcon, GitBranchIcon, HistoryIcon, XIcon, PanelLeftCloseIcon, PanelLeftOpenIcon, ChevronDownIcon, ChevronUpIcon, FileTextIcon, CodeIcon, WifiOff, ListTreeIcon, LoaderCircleIcon, SigmaIcon, BookOpenIcon, FunctionSquareIcon, SparklesIcon, TableIcon, BarChart3Icon, DiffIcon } from 'lucide-react';
import { FileTree } from './file-tree';
import { LaTeXEditor } from './latex-editor';
import { EditorToolbar } from './editor-toolbar';
import { CompilationLog } from './compilation-log';
import { EditorStatusBar } from './editor-status-bar';
import { FindInProject } from './find-in-project';
import { PdfViewer } from './pdf-viewer';
import { Collaborators } from './collaborators';

// Lazy-load right-panel components for code splitting
const VersionHistory = lazy(() => import('./version-history').then(m => ({ default: m.VersionHistory })));
const GitPanel = lazy(() => import('./git-panel').then(m => ({ default: m.GitPanel })));
const DocumentOutline = lazy(() => import('./document-outline').then(m => ({ default: m.DocumentOutline })));
const SymbolPicker = lazy(() => import('./symbol-picker').then(m => ({ default: m.SymbolPicker })));
const CitationPicker = lazy(() => import('./citation-picker').then(m => ({ default: m.CitationPicker })));
const MathPreview = lazy(() => import('./math-preview').then(m => ({ default: m.MathPreview })));
const AiAssistant = lazy(() => import('./ai-assistant').then(m => ({ default: m.AiAssistant })));
const OnboardingTips = lazy(() => import('./onboarding-tips').then(m => ({ default: m.OnboardingTips })));
const TableGenerator = lazy(() => import('./table-generator').then(m => ({ default: m.TableGenerator })));
const EquationBuilder = lazy(() => import('./equation-builder').then(m => ({ default: m.EquationBuilder })));
const DocumentStats = lazy(() => import('./document-stats').then(m => ({ default: m.DocumentStats })));
const ShareSnippet = lazy(() => import('./share-snippet').then(m => ({ default: m.ShareSnippet })));
import { RecoveryBanner } from './recovery-banner';
const DiffViewer = lazy(() => import('./diff-viewer').then(m => ({ default: m.DiffViewer })));
const LaTeXReference = lazy(() => import('./latex-reference').then(m => ({ default: m.LaTeXReference })));
import { useEditorStore } from '@/store/editor-store';
import { saveTabVersioned as saveTabVersionedShared, type SaveOutcome } from '@/lib/editor-save';
import { ApiClientError, fetchFileText, parseApiEnvelope } from '@/lib/api-client';
import {
  draftStorageSupported,
  loadDrafts,
  saveDrafts,
  deleteDrafts,
  quarantineLegacyDrafts,
  type DraftScope,
} from '@/lib/draft-storage';
import { ConflictBanner } from './conflict-banner';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { WebsocketProvider } from 'y-websocket';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { clientEnv } from '@/lib/client-env';
import { resolveConnectionState, type ProviderStatus } from '@/lib/connection-status';
import { useUiLocale } from '@/lib/ui-locale';

interface FileEntry {
  id: string;
  path: string;
  mimeType: string | null;
  isBinary: boolean;
  sizeBytes?: number;
}

interface EditorLayoutProps {
  projectId: string;
  projectName: string;
  /** Session user id — scopes crash-recovery drafts per user (N03). */
  currentUserId: string;
  initialMainFile?: string;
  initialRevision: string;
  files: FileEntry[];
  gitRemoteUrl?: string;
}

type RightPanel = 'pdf' | 'history' | 'git' | 'outline' | 'symbols' | 'cite' | 'math' | 'ai' | 'table' | 'equation' | 'stats' | 'diff' | 'ref';

import { EDITOR } from '@/lib/constants';
const AUTO_COMPILE_DEBOUNCE_MS = EDITOR.AUTO_COMPILE_DEBOUNCE_MS;
const AUTO_SAVE_DEBOUNCE_MS = EDITOR.AUTO_SAVE_DEBOUNCE_MS;

export function EditorLayout({ projectId, projectName, currentUserId, initialMainFile, initialRevision, files: initialFiles, gitRemoteUrl }: EditorLayoutProps) {
  const { t, locale, setLocale } = useUiLocale();
  const { resolvedTheme } = useTheme();
  const { tabs, activeTab, setActiveTab, closeTab, closeOtherTabs, closeAllTabs, sidebarCollapsed, toggleSidebar, logPanelCollapsed, toggleLogPanel } = useEditorStore();
  const [tabContextMenu, setTabContextMenu] = useState<{ x: number; y: number; path: string } | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [files, setFiles] = useState<FileEntry[]>(initialFiles);
  const observedRevision = useRef(initialRevision);
  const [mainFile, setMainFile] = useState(initialMainFile ?? 'main.tex');
  const [rightPanel, setRightPanel] = useState<RightPanel>('pdf');
  const [focusMode, setFocusMode] = useState(false);
  const focusModeRef = useRef(false);
  // Keep ref in sync so the keydown handler (registered once) reads the latest value
  useEffect(() => { focusModeRef.current = focusMode; }, [focusMode]);
  const [pdfRefreshKey, setPdfRefreshKey] = useState(0);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);
  const [wsStatus, setWsStatus] = useState<ProviderStatus | null>(null);
  const isOnline = useOnlineStatus();

  const handleConnectionChange = useCallback((status: ProviderStatus) => {
    setWsStatus(status);
  }, []);

  // Richer connection state for the reconnect/offline UX. Yjs holds edits
  // locally while disconnected and syncs on reconnect, so the copy reassures.
  const conn = resolveConnectionState({
    wsConfigured: !!clientEnv.NEXT_PUBLIC_WS_URL,
    browserOnline: isOnline,
    providerStatus: wsStatus,
  });
  const connToneText: Record<string, string> = {
    positive: 'text-green-600',
    pending: 'text-blue-600',
    warning: 'text-amber-600',
    neutral: 'text-muted-foreground',
  };
  const connToneDot: Record<string, string> = {
    positive: 'bg-green-500',
    pending: 'bg-blue-500',
    warning: 'bg-amber-500',
    neutral: 'bg-muted-foreground',
  };

  // Track recent project access
  useEffect(() => {
    import('@/lib/recent-projects').then(({ trackProjectAccess }) => {
      trackProjectAccess(projectId, projectName);
    });
  }, [projectId, projectName]);

  // Stable ref to the compile function registered by EditorToolbar
  const compileFnRef = useRef<(() => Promise<void>) | null>(null);

  // Debounce timers — SEPARATE on purpose (review N12): auto-save must keep
  // running when auto-compile is off, and one shared timer used to cancel
  // the other's schedule.
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoCompileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeTabData = tabs.find((t) => t.path === activeTab);
  const openFile = useEditorStore((s) => s.openFile);

  // Auto-open the main file on first load if no tabs are open
  useEffect(() => {
    if (tabs.length === 0 && files.length > 0) {
      const main = files.find((f) => f.path === mainFile) ?? files.find((f) => f.path.endsWith('.tex')) ?? files[0];
      if (main && !main.isBinary) {
        void (async () => {
          try {
            // Envelope-validated read with the server baseline + fileId.
            const data = await fetchFileText(projectId, main.path);
            openFile(main.path, data.content, data.sha256, main.id);
          } catch (err) {
            // N05: a failed load must NOT open an editable blank tab — a
            // later save on such a tab would create a brand-new empty file
            // over the real one's path. Leave the editor empty instead.
            console.error('Failed to load main file:', err);
            toast.error('Could not load the main file — open it from the sidebar to retry');
          }
        })();
      }
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleProviderReady = useCallback((p: WebsocketProvider) => {
    providerRef.current = p;
    setProvider(p);
  }, []);

  // ---------- crash-recovery drafts (N03 / PR-A) ----------

  /** Identity scope for this user's drafts in this project on this instance. */
  const draftScope = useMemo<DraftScope>(
    () => ({
      instanceId: typeof window === 'undefined' ? 'server' : window.location.origin,
      userId: currentUserId,
      projectId,
    }),
    [currentUserId, projectId],
  );
  const draftScopeRef = useRef(draftScope);
  draftScopeRef.current = draftScope;

  // One-time recovery on mount: quarantine legacy localStorage drafts, then
  // restore full-content drafts for files that still exist in this project.
  useEffect(() => {
    if (!draftStorageSupported()) return;
    let cancelled = false;
    void (async () => {
      await quarantineLegacyDrafts();
      const drafts = await loadDrafts(draftScopeRef.current);
      if (cancelled || drafts.length === 0) return;
      const existingFileIds = new Set(files.map((f) => f.id));
      const restorable = drafts.filter((d) => existingFileIds.has(d.fileId));
      const stale = drafts.filter((d) => !existingFileIds.has(d.fileId)).map((d) => d.fileId);
      if (stale.length > 0) await deleteDrafts(draftScopeRef.current, stale);
      if (restorable.length === 0) return;
      useEditorStore.getState().recoverTabs(
        restorable.map((d) => ({
          path: d.path,
          fileId: d.fileId,
          content: d.content,
          baseSha256: d.baseSha256,
          editSeq: d.editSeq,
          savedSeq: d.savedSeq,
        })),
      );
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  // Persist drafts (full content, scoped identity). Debounced; committed
  // tabs and closed tabs get their drafts removed. Quota failures surface
  // ONCE as a warning — never a silent truncation.
  const quotaWarnedRef = useRef(false);
  useEffect(() => {
    if (!draftStorageSupported()) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useEditorStore.subscribe((state, prevState) => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const scope = draftScopeRef.current;

        // Drafts of tabs that were closed (or fully committed) are removed.
        const openDirtyIds = new Set(
          state.tabs.filter((t) => t.fileId && t.dirty).map((t) => t.fileId as string),
        );
        const removable = [
          ...prevState.tabs
            .filter((t) => t.fileId && !state.tabs.some((s) => s.fileId === t.fileId))
            .map((t) => t.fileId as string),
          ...state.tabs
            .filter((t) => t.fileId && !t.dirty && t.status === 'clean')
            .map((t) => t.fileId as string),
        ].filter((id) => !openDirtyIds.has(id));
        if (removable.length > 0) await deleteDrafts(scope, removable);

        // Full-content drafts for tabs with pending local state.
        const pending = state.tabs.filter(
          (t) =>
            t.fileId &&
            (t.dirty || t.status === 'saving' || t.status === 'conflict' || t.status === 'error' || t.status === 'recoveryUnverified'),
        );
        if (pending.length === 0) return;
        const result = await saveDrafts(
          scope,
          pending.map((t) => ({
            fileId: t.fileId as string,
            path: t.path,
            content: t.content, // FULL content — no slice(), ever (N03)
            baseSha256: t.baseSha256,
            editSeq: t.editSeq,
            savedSeq: t.savedSeq,
          })),
        );
        if (!result.ok && !quotaWarnedRef.current) {
          quotaWarnedRef.current = true;
          toast.warning(
            `Local crash recovery is unavailable: ${result.reason}. ` +
            'Edits still save to the server normally.',
          );
        }
      }, 800);
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, []);

  const handleRefresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/files`);
      if (res.ok) {
        const result = await res.json();
        const data = (result.data ?? result) as FileEntry[];
        setFiles(data);
      }
    } catch {
      // ignore
    }
  }, [projectId]);

  // Revision polling is the durable cross-session signal. Redis events may be
  // missed; a newer committed revision is enough to recheck open file hashes.
  // Clean tabs refresh only when their baseline is still unchanged. Dirty tabs
  // keep their local body and enter the explicit conflict flow if their own
  // server file changed.
  useEffect(() => {
    let active = true;
    let busy = false;
    const check = async () => {
      if (!active || busy || document.visibilityState === 'hidden') return;
      busy = true;
      try {
        const response = await fetch(`/api/v1/projects/${projectId}`, { cache: 'no-store' });
        const data = await parseApiEnvelope<{ revision: string; files: FileEntry[] }>(
          response, (value) => {
            const project = value as { revision?: unknown; files?: unknown };
            return typeof project?.revision === 'string' && Array.isArray(project.files);
          });
        if (!active || data.revision === observedRevision.current) return;
        observedRevision.current = data.revision;
        const latestFiles = data.files.map((file) => ({ ...file,
          sizeBytes: file.sizeBytes === undefined ? undefined : Number(file.sizeBytes) }));
        setFiles(latestFiles);
        const byPath = new Map(latestFiles.map((file) => [file.path, file]));
        const state = useEditorStore.getState();
        const ownRevision = state.tabs.some((tab) => tab.lastKnownRevision === data.revision);
        let conflicts = 0;
        let refreshed = 0;
        for (const tab of state.tabs) {
          if (!tab.fileId || !byPath.has(tab.path)) {
            if (tab.dirty) conflicts += 1;
            continue;
          }
          try {
            const remote = await fetchFileText(projectId, tab.path);
            if (!active || remote.sha256 === tab.baseSha256) continue;
            if (tab.status === 'clean' && !tab.dirty) {
              useEditorStore.getState().refreshCleanTab(
                tab.path, tab.baseSha256, remote.content, remote.sha256, data.revision);
              refreshed += 1;
            } else if (tab.status !== 'conflict' && tab.status !== 'recoveryUnverified') {
              useEditorStore.getState().markConflict(tab.path, remote);
              conflicts += 1;
            }
          } catch (error) {
            if (error instanceof ApiClientError && error.status === 404 && tab.dirty) {
              useEditorStore.getState().markConflict(tab.path);
              conflicts += 1;
            }
          }
        }
        if (conflicts > 0) toast.warning('Server files changed. Review the conflict before saving.');
        else if (refreshed > 0 && !ownRevision) toast.info('Project updated from another session.');
      } catch {
        // A missed poll is harmless: the next one compares the committed revision.
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(() => { void check(); }, 15_000);
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { active = false; clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible); };
  }, [projectId]);

  /** Save one tab through the shared versioned protocol (PR-1 R01): the request
   * carries the SHA-256 baseline so the server can refuse a stale overwrite.
   */
  const saveTabVersioned = useCallback(
    (path: string): Promise<SaveOutcome> => saveTabVersionedShared(projectId, path),
    [projectId],
  );

  const handleSave = useCallback(
    async (content: string) => {
      if (!activeTab) return;
      const state = useEditorStore.getState();
      const tab = state.tabs.find((t) => t.path === activeTab);
      if (!tab) return;
      // Sync the latest keystrokes before saving (handleSave may be triggered
      // by the editor with fresh content while the store lags a tick).
      if (tab.content !== content) useEditorStore.getState().updateContent(activeTab, content);
      const outcome = await saveTabVersioned(activeTab);
      if (outcome === 'saved') {
        toast.success('File saved');
      } else if (outcome === 'conflict') {
        toast.error('Conflict: the file changed on the server. Your edit was kept; re-review before saving.');
      } else {
        console.error('Save failed');
        toast.error('Save failed');
      }
    },
    [activeTab, saveTabVersioned],
  );

  /**
   * Auto-save every dirty tab (single-flight per file inside
   * saveTabVersioned). Conflicted / unverified-recovery tabs never re-enter
   * auto-upload. Deliberately independent of auto-compile: with compile off,
   * edits must still persist.
   */
  const autoSaveDirty = useCallback(async () => {
    const state = useEditorStore.getState();
    const dirty = state.tabs.filter(
      (t) => t.dirty && t.status !== 'conflict' && t.status !== 'recoveryUnverified',
    );
    for (const tab of dirty) {
      await saveTabVersioned(tab.path); // conflict/failure keeps the tab dirty
    }
  }, [saveTabVersioned]);

  /** Tabs whose local state must block or flag a "current draft" compile. */
  const unresolvedTabs = () =>
    useEditorStore
      .getState()
      .tabs.filter((t) => t.dirty || t.status === 'conflict' || t.status === 'error');

  /**
   * Gated manual compile (review N12): EVERY compile entry point (button,
   * Ctrl+Shift+C, the latex-compile event) first flushes the pending saves of
   * ALL files, then — if anything is still unsaved or conflicted — asks the
   * user explicitly whether to compile the last saved versions. The old
   * toolbar button fired a compile that could silently use stale bytes.
   */
  const requestCompile = useCallback(async () => {
    await autoSaveDirty();
    const unresolved = unresolvedTabs();
    if (unresolved.length > 0) {
      const names = unresolved.slice(0, 3).map((t) => t.path).join(', ');
      const more = unresolved.length > 3 ? ` and ${unresolved.length - 3} more` : '';
      const proceed = window.confirm(
        `${unresolved.length} file(s) have unsaved or conflicted changes (${names}${more}).\n\n` +
        'Compile now using the LAST SAVED versions on the server? ' +
        'The PDF will not include those local changes.',
      );
      if (!proceed) return;
    }
    if (!compileFnRef.current) return;
    await compileFnRef.current();
    setPdfRefreshKey((k) => k + 1);
  }, [autoSaveDirty]);

  /**
   * Auto-compile: flush ALL pending saves first, then only compile when every
   * tab is clean — a PDF built from half-saved input must never be presented
   * as "the current draft compiled" (review N12).
   */
  const triggerAutoCompile = useCallback(async () => {
    const state = useEditorStore.getState();
    if (!state.activeTab) return;

    await autoSaveDirty();
    const unresolved = unresolvedTabs();
    if (unresolved.length > 0) {
      // Skip silently-with-a-trace: the user just typed, the next successful
      // flush will compile instead of building a misleading PDF.
      console.info('Auto-compile skipped: unresolved tabs', unresolved.map((t) => t.path));
      return;
    }
    if (compileFnRef.current) {
      await compileFnRef.current();
      setPdfRefreshKey((k) => k + 1);
    }
  }, [autoSaveDirty]);

  /** Schedule a debounced auto-save (fires regardless of auto-compile). */
  const scheduleAutoSave = useCallback(() => {
    const state = useEditorStore.getState();
    if (!state.autoSaveEnabled) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      void autoSaveDirty();
    }, AUTO_SAVE_DEBOUNCE_MS);
  }, [autoSaveDirty]);

  /** Schedule a debounced auto-compile after the latest keystroke — on its
   * OWN timer, so it cannot cancel a pending auto-save (N12). */
  const scheduleAutoCompile = useCallback(() => {
    const state = useEditorStore.getState();
    if (!state.autoCompileEnabled) return;
    if (autoCompileTimer.current) clearTimeout(autoCompileTimer.current);
    autoCompileTimer.current = setTimeout(() => {
      void triggerAutoCompile();
    }, AUTO_COMPILE_DEBOUNCE_MS);
  }, [triggerAutoCompile]);

  // Watch the Zustand tabs array for dirty content changes. Auto-save is
  // scheduled on every keystroke (independent of auto-compile); auto-compile
  // rides on top only when the toggle is on.
  useEffect(() => {
    // Only react when there is an active dirty tab
    const state = useEditorStore.getState();
    const currentTab = state.activeTab;
    if (!currentTab) return;
    const tabData = state.tabs.find((t) => t.path === currentTab);
    if (tabData?.dirty) {
      scheduleAutoSave();
      scheduleAutoCompile();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // Depend on the content of the active tab so the effect fires on each keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    tabs.find((t) => t.path === activeTab)?.content,
    scheduleAutoSave,
    scheduleAutoCompile,
  ]);

  // Cleanup BOTH debounce timers on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      if (autoCompileTimer.current) clearTimeout(autoCompileTimer.current);
    };
  }, []);

  // Ctrl+Shift+F or command palette event to open Find in Project
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'f') {
        e.preventDefault();
        setFindOpen(true);
        return;
      }
      // Ctrl+Tab / Ctrl+Shift+Tab to cycle tabs
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        const t = useEditorStore.getState().tabs;
        const active = useEditorStore.getState().activeTab;
        if (t.length < 2) return;
        const idx = t.findIndex((x) => x.path === active);
        const next = e.shiftKey
          ? (idx - 1 + t.length) % t.length
          : (idx + 1) % t.length;
        setActiveTab(t[next].path);
        return;
      }
      // Ctrl+1-9 to jump to tab by position
      if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '9') {
        const t = useEditorStore.getState().tabs;
        const idx = parseInt(e.key, 10) - 1;
        if (idx < t.length) {
          e.preventDefault();
          setActiveTab(t[idx].path);
        }
      }
      // Escape to exit focus mode (use ref to avoid stale closure)
      if (e.key === 'Escape' && focusModeRef.current) {
        setFocusMode(false);
        return;
      }
      // F11 to toggle focus mode
      if (e.key === 'F11') {
        e.preventDefault();
        setFocusMode(f => !f);
        return;
      }
      // Ctrl+Shift+C to compile — through the flush-first gate (N12)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'c') {
        e.preventDefault();
        void requestCompile();
        return;
      }
      // Ctrl+J to toggle log panel
      if ((e.ctrlKey || e.metaKey) && e.key === 'j') {
        e.preventDefault();
        toggleLogPanel();
        return;
      }
      // Ctrl+\ to toggle sidebar
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault();
        toggleSidebar();
        return;
      }
      // Ctrl+N to create new file
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('new-file'));
        return;
      }
      // Ctrl+W to close current tab
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault();
        const active = useEditorStore.getState().activeTab;
        if (active) closeTab(active);
        return;
      }
      // Ctrl+= / Ctrl+- to zoom editor font
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        const s = useEditorStore.getState();
        s.setFontSize(Math.min(32, s.fontSize + 1));
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        const s = useEditorStore.getState();
        s.setFontSize(Math.max(8, s.fontSize - 1));
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        useEditorStore.getState().setFontSize(14);
      }
    }
    function handleFindEvent() { setFindOpen(true); }
    function handleCompileEvent() {
      void requestCompile();
    }
    function handleAutoSaveEvent() {
      // The recovery banner emits this after the user confirmed restored
      // drafts — flush a save for them right away.
      void autoSaveDirty();
    }
    function handleOpenFileAtLine(e: Event) {
      const { path: filePath, line } = (e as CustomEvent<{ path: string; line: number }>).detail;
      // Try to open the file from the project and jump to line
      const existingTab = useEditorStore.getState().tabs.find((t) => t.path === filePath || t.path.endsWith(filePath));
      if (existingTab) {
        setActiveTab(existingTab.path);
        setTimeout(() => window.dispatchEvent(new CustomEvent('editor-goto-line', { detail: line })), 100);
      } else {
        // Fetch file content and open it — envelope-validated; a failed read
        // must not open an editable blank tab (N05).
        void (async () => {
          try {
            const data = await fetchFileText(projectId, filePath);
            openFile(filePath, data.content, data.sha256, null);
            setTimeout(() => window.dispatchEvent(new CustomEvent('editor-goto-line', { detail: line })), 200);
          } catch {
            window.dispatchEvent(new CustomEvent('editor-goto-line', { detail: line }));
          }
        })();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('find-in-files', handleFindEvent);
    window.addEventListener('latex-compile', handleCompileEvent);
    window.addEventListener('editor-open-file-at-line', handleOpenFileAtLine);
    window.addEventListener('trigger-autosave', handleAutoSaveEvent);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('find-in-files', handleFindEvent);
      window.removeEventListener('latex-compile', handleCompileEvent);
      window.removeEventListener('editor-open-file-at-line', handleOpenFileAtLine);
      window.removeEventListener('trigger-autosave', handleAutoSaveEvent);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (useEditorStore.getState().hasUnsavedChanges()) {
        e.preventDefault();
        // Some Chromium/legacy Safari builds still require returnValue
        // even though the spec deprecated it. Setting both is harmless.
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Recovery banner for crashed sessions (verified + quarantined drafts) */}
      <RecoveryBanner />
      {/* Connection banner — offline / reconnecting / connecting (Yjs keeps
          edits locally and syncs on reconnect, so the copy is reassuring) */}
      {conn.banner && (
        <div
          className={cn(
            'flex items-center gap-2 border-b px-4 py-1.5 text-xs',
            conn.state === 'offline'
              ? 'bg-red-500/10 border-red-500/20 text-red-600'
              : conn.tone === 'warning'
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-600'
                : 'bg-blue-500/10 border-blue-500/20 text-blue-600',
          )}
        >
          {conn.tone === 'pending' ? (
            <LoaderCircleIcon className="size-3.5 animate-spin" />
          ) : (
            <WifiOff className="size-3.5" />
          )}
          {conn.banner}
        </div>
      )}

      {/* Top toolbar */}
      <div className={cn('flex min-w-0 items-center border-b bg-background', focusMode && 'hidden')}>
        <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain">
          <EditorToolbar
            projectId={projectId}
            projectName={projectName}
            onCompileReady={(fn) => { compileFnRef.current = fn; }}
            onCompile={requestCompile}
          />
        </div>
        <div className="flex shrink-0 items-center gap-2 border-l px-3">
          <button type="button" className="rounded px-1.5 py-1 text-xs font-medium hover:bg-muted" onClick={() => setLocale(locale === 'en' ? 'zh-CN' : 'en')} aria-label={t('Language')} title={t('Language')}>
            {locale === 'en' ? '中文' : 'EN'}
          </button>
          {conn.state !== 'local' && (
            <div
              className={cn('flex items-center gap-1.5 text-xs', connToneText[conn.tone])}
              title={conn.label}
            >
              <span
                className={cn(
                  'size-2 rounded-full',
                  connToneDot[conn.tone],
                  conn.tone === 'pending' && 'animate-pulse',
                )}
              />
              {conn.label}
            </div>
          )}
          {provider && <Collaborators provider={provider} />}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left sidebar – file tree */}
        <aside className={cn(
          'shrink-0 border-r bg-background transition-all duration-200',
          (sidebarCollapsed || focusMode) ? 'w-0 overflow-hidden' : 'w-[220px]'
        )}>
          <FileTree
            projectId={projectId}
            files={files}
            mainFile={mainFile}
            onRefresh={() => void handleRefresh()}
            onMainFileChange={setMainFile}
          />
        </aside>

        {/* Sidebar toggle */}
        <button
          onClick={toggleSidebar}
          className="flex w-5 shrink-0 items-center justify-center border-r bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
          aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
        >
          {sidebarCollapsed ? <PanelLeftOpenIcon className="size-3" /> : <PanelLeftCloseIcon className="size-3" />}
        </button>

        {/* Centre – tab bar + editor */}
        <div className="flex min-w-0 flex-1 flex-col border-r">
          {/* Conflict banner — the only sanctioned conflict resolution path (N07) */}
          <ConflictBanner projectId={projectId} />

          {/* Tab bar */}
          <div className="flex items-end gap-0.5 overflow-x-auto border-b bg-muted/40 px-1 pt-1">
            {tabs.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                {t('Open a file from the sidebar')}
              </div>
            ) : (
              tabs.map((tab) => (
                <button
                  key={tab.path}
                  onClick={() => setActiveTab(tab.path)}
                  onMouseDown={(e) => {
                    // Middle-click to close tab
                    if (e.button === 1) { e.preventDefault(); closeTab(tab.path); }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setTabContextMenu({ x: e.clientX, y: e.clientY, path: tab.path });
                  }}
                  title={tab.path}
                  className={cn(
                    'group flex items-center gap-1.5 rounded-t-md border border-b-0 px-3 py-1.5 text-xs transition-colors',
                    activeTab === tab.path
                      ? 'border-border bg-background text-foreground'
                      : 'border-transparent bg-muted/60 text-muted-foreground hover:bg-muted',
                  )}
                >
                  <TabFileIcon path={tab.path} />
                  <span className="max-w-[140px] truncate">{tab.path.split('/').pop()}</span>
                  {tab.dirty && (
                    <span
                      className="size-1.5 rounded-full bg-amber-400"
                      aria-label="unsaved"
                    />
                  )}
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Close ${tab.path}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.path);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation();
                        closeTab(tab.path);
                      }
                    }}
                    className="ml-0.5 rounded p-0.5 opacity-0 transition-opacity hover:bg-muted-foreground/20 group-hover:opacity-100"
                  >
                    <XIcon className="size-2.5" />
                  </span>
                </button>
              ))
            )}
          </div>

          {/* Tab context menu */}
          {tabContextMenu && (
            <TabContextMenu
              x={tabContextMenu.x}
              y={tabContextMenu.y}
              onClose={() => setTabContextMenu(null)}
              actions={[
                { label: 'Close', onAction: () => { closeTab(tabContextMenu.path); setTabContextMenu(null); } },
                { label: 'Close Others', onAction: () => { closeOtherTabs(tabContextMenu.path); setTabContextMenu(null); } },
                { label: 'Close All', onAction: () => { closeAllTabs(); setTabContextMenu(null); }, destructive: true },
              ]}
            />
          )}

          {/* Editor area */}
          <div className="min-h-0 flex-1">
            {activeTabData ? (
              <LaTeXEditor
                key={activeTabData.path}
                initialContent={activeTabData.content}
                filePath={activeTabData.path}
                projectId={projectId}
                theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
                onSave={handleSave}
                onProviderReady={handleProviderReady}
                onConnectionChange={handleConnectionChange}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                <div className="text-center space-y-3">
                  <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-muted/50">
                    <CodeIcon className="size-8 text-muted-foreground/50" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{projectName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t('Select a file from the sidebar to start editing')}</p>
                  </div>
                  <div className="flex items-center justify-center gap-4 text-[11px] text-muted-foreground/70">
                    <span className="flex items-center gap-1"><FileTextIcon className="size-3" /> {files.length} files</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Editor status bar */}
          <EditorStatusBar />

          {/* Compilation log – bottom panel */}
          <div className={cn('shrink-0 border-t transition-all duration-200', logPanelCollapsed ? 'h-8' : 'h-44')}>
            <div className="flex h-8 items-center justify-between border-b bg-muted/30 px-2">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{t('Output')}</span>
              <button
                onClick={toggleLogPanel}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title={logPanelCollapsed ? 'Expand log' : 'Collapse log'}
              >
                {logPanelCollapsed ? <ChevronUpIcon className="size-3.5" /> : <ChevronDownIcon className="size-3.5" />}
              </button>
            </div>
            {!logPanelCollapsed && <CompilationLog />}
          </div>
        </div>

        {/* Right – switchable panel */}
        <div className={cn('flex min-w-0 w-[45%] shrink-0 flex-col', focusMode && 'hidden')}>
          {/* Panel tabs */}
          <div className="flex shrink-0 items-center gap-1 overflow-x-auto whitespace-nowrap border-b bg-muted/40 px-2 py-1 [&>button]:shrink-0">
            <Button
              size="sm"
              variant={rightPanel === 'pdf' ? 'secondary' : 'ghost'}
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => setRightPanel('pdf')}
              aria-pressed={rightPanel === 'pdf'}
            >
              <FileIcon className="size-3.5" />
              {t('PDF')}
            </Button>
            <Button
              size="sm"
              variant={rightPanel === 'history' ? 'secondary' : 'ghost'}
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => setRightPanel('history')}
              aria-pressed={rightPanel === 'history'}
            >
              <HistoryIcon className="size-3.5" />
              {t('History')}
            </Button>
            <Button
              size="sm"
              variant={rightPanel === 'git' ? 'secondary' : 'ghost'}
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => setRightPanel('git')}
              aria-pressed={rightPanel === 'git'}
            >
              <GitBranchIcon className="size-3.5" />
              {t('Git')}
            </Button>
            <Button
              size="sm"
              variant={rightPanel === 'outline' ? 'secondary' : 'ghost'}
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => setRightPanel('outline')}
              aria-pressed={rightPanel === 'outline'}
            >
              <ListTreeIcon className="size-3.5" />
              {t('Outline')}
            </Button>
            <Button
              size="sm"
              variant={rightPanel === 'symbols' ? 'secondary' : 'ghost'}
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => setRightPanel('symbols')}
              aria-pressed={rightPanel === 'symbols'}
            >
              <SigmaIcon className="size-3.5" />
              {t('Symbols')}
            </Button>
            <Button
              size="sm"
              variant={rightPanel === 'cite' ? 'secondary' : 'ghost'}
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => setRightPanel('cite')}
              aria-pressed={rightPanel === 'cite'}
            >
              <BookOpenIcon className="size-3.5" />
              {t('Cite')}
            </Button>
            <Button
              size="sm"
              variant={rightPanel === 'math' ? 'secondary' : 'ghost'}
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => setRightPanel('math')}
              aria-pressed={rightPanel === 'math'}
            >
              <FunctionSquareIcon className="size-3.5" />
              {t('Math')}
            </Button>
            <Button
              size="sm"
              variant={rightPanel === 'ai' ? 'secondary' : 'ghost'}
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => setRightPanel('ai')}
              aria-pressed={rightPanel === 'ai'}
            >
              <SparklesIcon className="size-3.5 text-orange-500" />
              AI
            </Button>
            <Button
              size="sm"
              variant={rightPanel === 'table' ? 'secondary' : 'ghost'}
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => setRightPanel('table')}
              aria-pressed={rightPanel === 'table'}
            >
              <TableIcon className="size-3.5" />
              {t('Table')}
            </Button>
            <Button
              size="sm"
              variant={rightPanel === 'equation' ? 'secondary' : 'ghost'}
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => setRightPanel('equation')}
              aria-pressed={rightPanel === 'equation'}
            >
              <FunctionSquareIcon className="size-3.5" />
              {t('Eq')}
            </Button>
            <Button
              size="sm"
              variant={rightPanel === 'stats' ? 'secondary' : 'ghost'}
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => setRightPanel('stats')}
              aria-pressed={rightPanel === 'stats'}
            >
              <BarChart3Icon className="size-3.5" />
              {t('Stats')}
            </Button>
            <Button
              size="sm"
              variant={rightPanel === 'diff' ? 'secondary' : 'ghost'}
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => setRightPanel('diff')}
              aria-pressed={rightPanel === 'diff'}
            >
              <DiffIcon className="size-3.5" />
              {t('Diff')}
            </Button>
            <Button
              size="sm"
              variant={rightPanel === 'ref' ? 'secondary' : 'ghost'}
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => setRightPanel('ref')}
              aria-pressed={rightPanel === 'ref'}
            >
              <BookOpenIcon className="size-3.5" />
              {t('Ref')}
            </Button>
          </div>

          {/* Panel content */}
          <div className="min-h-0 flex-1">
            {rightPanel === 'pdf' && <PdfViewer refreshKey={pdfRefreshKey} projectName={projectName} />}
            <Suspense fallback={<div className="flex h-full items-center justify-center"><LoaderCircleIcon className="size-5 animate-spin text-muted-foreground" /></div>}>
              {rightPanel === 'history' && <VersionHistory projectId={projectId} />}
              {rightPanel === 'git' && <GitPanel projectId={projectId} remoteUrl={gitRemoteUrl} />}
              {rightPanel === 'outline' && <DocumentOutline />}
              {rightPanel === 'symbols' && <SymbolPicker />}
              {rightPanel === 'cite' && <CitationPicker />}
              {rightPanel === 'math' && <MathPreview />}
              {rightPanel === 'ai' && <AiAssistant />}
              {rightPanel === 'table' && <TableGenerator />}
              {rightPanel === 'equation' && <EquationBuilder />}
              {rightPanel === 'stats' && <DocumentStats />}
              {rightPanel === 'diff' && <DiffViewer />}
              {rightPanel === 'ref' && <LaTeXReference />}
            </Suspense>
          </div>
        </div>
      </div>

      {/* Find in Project dialog */}
      <FindInProject projectId={projectId} open={findOpen} onOpenChange={setFindOpen} />

      {/* Share snippet dialog */}
      <Suspense fallback={null}>
        <ShareSnippet />
      </Suspense>

      {/* First-time user onboarding */}
      <Suspense fallback={null}>
        <OnboardingTips />
      </Suspense>
    </div>
  );
}

function TabFileIcon({ path }: { path: string }) {
  const ext = path.split('.').pop()?.toLowerCase();
  const cls = 'size-3 shrink-0';
  switch (ext) {
    case 'tex': case 'ltx': return <FileTextIcon className={`${cls} text-blue-500`} />;
    case 'bib': case 'bst': return <BookOpenIcon className={`${cls} text-amber-500`} />;
    case 'cls': case 'sty': return <CodeIcon className={`${cls} text-purple-500`} />;
    default: return <FileIcon className={`${cls} text-muted-foreground`} />;
  }
}

/* ---------- Accessible tab context menu with keyboard navigation ---------- */
interface ContextAction {
  label: string;
  onAction: () => void;
  destructive?: boolean;
}

function TabContextMenu({ x, y, onClose, actions }: { x: number; y: number; onClose: () => void; actions: ContextAction[] }) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [focusIdx, setFocusIdx] = useState(0);

  // Auto-focus the menu on mount and handle keyboard navigation
  useEffect(() => {
    menuRef.current?.focus();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
      case 'ArrowDown':
        e.preventDefault();
        setFocusIdx((prev) => (prev + 1) % actions.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusIdx((prev) => (prev - 1 + actions.length) % actions.length);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        actions[focusIdx].onAction();
        break;
      case 'Home':
        e.preventDefault();
        setFocusIdx(0);
        break;
      case 'End':
        e.preventDefault();
        setFocusIdx(actions.length - 1);
        break;
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50" onClick={onClose} />
      <div
        ref={menuRef}
        role="menu"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="fixed z-50 min-w-[160px] rounded-md border bg-popover p-1 shadow-lg outline-none"
        style={{ left: x, top: y }}
      >
        {actions.map((action, i) => (
          <button
            key={action.label}
            role="menuitem"
            tabIndex={-1}
            className={cn(
              'flex w-full items-center rounded-sm px-2 py-1.5 text-xs transition-colors',
              i === focusIdx ? 'bg-accent text-accent-foreground' : 'hover:bg-accent',
              action.destructive && 'text-destructive',
            )}
            onMouseEnter={() => setFocusIdx(i)}
            onClick={action.onAction}
          >
            {action.label}
          </button>
        ))}
      </div>
    </>
  );
}

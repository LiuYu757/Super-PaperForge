'use client';

import { useEffect, useRef, useState } from 'react';
import {
  PlayIcon,
  LoaderCircleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ZapIcon,
  ZapOffIcon,
  FileDownIcon,
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  SigmaIcon,
  Heading1Icon,
  Heading2Icon,
  ListIcon,
  ListOrderedIcon,
  LinkIcon,
  ImageIcon,
  KeyboardIcon,
  Share2Icon,
  ArchiveIcon,
  WrapTextIcon,
  FileTextIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useEditorStore } from '@/store/editor-store';
import { toast } from 'sonner';
import { useUiLocale } from '@/lib/ui-locale';

interface EditorToolbarProps {
  projectId: string;
  projectName?: string;
  /** Called by the parent to imperatively trigger a compile. */
  onCompileReady?: (compileFn: () => Promise<void>) => void;
  /**
   * Gated compile entry (PR-B, review N12): flushes pending saves and
   * confirms before compiling stale input. When omitted (e.g. isolated
   * toolbar usage) the raw compile runs.
   */
  onCompile?: () => Promise<void> | void;
}

import { EDITOR } from '@/lib/constants';
const STATUS_POLL_INTERVAL_MS = EDITOR.STATUS_POLL_INTERVAL_MS;
const MAX_POLL_ATTEMPTS = EDITOR.MAX_POLL_ATTEMPTS;

type CompilationResponse = {
  id: string;
  status: string;
  log: string | null;
  durationMs: number | null;
  docxMinioKey?: string | null;
};

const insertLatex = (command: string) => {
  window.dispatchEvent(new CustomEvent('latex-insert', { detail: command }));
};

const FORMATTING_BUTTONS = [
  { label: 'Bold', icon: BoldIcon, command: '\\textbf{}', shortcut: 'Ctrl+B' },
  { label: 'Italic', icon: ItalicIcon, command: '\\textit{}', shortcut: 'Ctrl+I' },
  { label: 'Underline', icon: UnderlineIcon, command: '\\underline{}', shortcut: '' },
  { label: 'Math mode', icon: SigmaIcon, command: '$$', shortcut: 'Ctrl+M' },
] as const;

const STRUCTURE_BUTTONS = [
  { label: 'Section', icon: Heading1Icon, command: '\\section{}' },
  { label: 'Subsection', icon: Heading2Icon, command: '\\subsection{}' },
  { label: 'Bullet list', icon: ListIcon, command: '\\begin{itemize}\n  \\item \n\\end{itemize}' },
  { label: 'Numbered list', icon: ListOrderedIcon, command: '\\begin{enumerate}\n  \\item \n\\end{enumerate}' },
  { label: 'Link', icon: LinkIcon, command: '\\href{}{}' },
  { label: 'Image', icon: ImageIcon, command: '\\includegraphics{}' },
] as const;

export function EditorToolbar({ projectId, projectName, onCompileReady, onCompile }: EditorToolbarProps) {
  const { t } = useUiLocale();
  const { compilationStatus, setCompilationStatus, setCompilationLog, setCompilationDuration, setLatestPdfUrl, autoCompileEnabled, toggleAutoCompile } =
    useEditorStore();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [docxUrl, setDocxUrl] = useState<string | null>(null);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function handleCompile() {
    if (compilationStatus === 'compiling') return;
    stopPolling();

    setCompilationStatus('compiling');
    setCompilationLog('');
    setCompilationDuration(null);
    setDocxUrl(null);
    const compileStart = Date.now();

    try {
      const res = await fetch(`/api/v1/projects/${projectId}/compile`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Compilation request failed' }));
        const errPayload = (err as { error?: string | { message?: string } }).error;
        const errMsg = typeof errPayload === 'string'
          ? errPayload
          : (errPayload as { message?: string } | undefined)?.message ?? 'Compilation request failed';
        setCompilationLog(errMsg);
        setCompilationStatus('error');
        toast.error('Compilation failed');
        return;
      }

      const compileResult = await res.json();
      const compilation = compileResult.data ?? compileResult;
      const compileId = compilation.id;

      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts++;
        if (attempts > MAX_POLL_ATTEMPTS) {
          stopPolling();
          setCompilationLog('Compilation timed out.');
          setCompilationStatus('error');
          toast.error('Compilation failed');
          return;
        }

        try {
          const statusRes = await fetch(
            `/api/v1/projects/${projectId}/compile/${compileId}/status`,
          );
          if (!statusRes.ok) return;

          const statusResult = await statusRes.json();
          const data = (statusResult.data ?? statusResult) as CompilationResponse;

          if (data.status === 'success') {
            stopPolling();
            setCompilationStatus('success');
            setCompilationLog(data.log ?? '');
            setLatestPdfUrl(`/api/v1/projects/${projectId}/compile/${compileId}/pdf`);
            if (data.docxMinioKey) {
              setDocxUrl(`/api/v1/projects/${projectId}/compile/${compileId}/docx`);
            }
            setCompilationDuration(Date.now() - compileStart);
            toast.success('Compiled successfully');
          } else if (data.status === 'failed' || data.status === 'error' || data.status === 'cancelled') {
            stopPolling();
            setCompilationStatus('error');
            setCompilationLog(data.log ?? (data.status === 'cancelled' ? 'Compilation cancelled.' : 'Compilation failed.'));
            toast.error(data.status === 'cancelled' ? 'Compilation cancelled' : 'Compilation failed');
          }
          // still 'queued' or 'running' — keep polling
        } catch {
          // network hiccup — keep polling
        }
      }, STATUS_POLL_INTERVAL_MS);
    } catch (err) {
      setCompilationLog(err instanceof Error ? err.message : 'Unknown error');
      setCompilationStatus('error');
      toast.error('Compilation failed');
    }
  }

  // Keep a ref to the latest handleCompile so the parent always calls
  // the current closure (with up-to-date compilationStatus captured in it).
  const handleCompileRef = useRef(handleCompile);
  handleCompileRef.current = handleCompile;

  // Expose a stable wrapper to the parent exactly once on mount.
  // Also clean up polling on unmount to prevent memory leaks.
  useEffect(() => {
    if (onCompileReady) {
      onCompileReady(() => handleCompileRef.current());
    }
    return () => stopPolling();
    // onCompileReady identity is stable; only run on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isCompiling = compilationStatus === 'compiling';

  // Download via fetch so plan-gated responses (e.g. 402 on DOCX/ZIP for Free
  // plans) surface as a toast instead of saving an error payload to disk.
  async function guardedDownload(url: string, filename: string) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const message =
          typeof body?.error === 'string'
            ? body.error
            : body?.error?.message ?? 'Download failed';
        toast.error(message);
        return;
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      toast.error('Download failed');
    }
  }

  return (
    <div className="flex w-max min-w-full items-center gap-1.5 whitespace-nowrap bg-background px-3 py-1.5 [&>*]:shrink-0">
      {/* Project name */}
      {projectName && (
        <>
          <span className="mr-1 max-w-[160px] truncate text-sm font-semibold text-foreground" title={projectName}>
            {projectName}
          </span>
          <ToolbarSeparator />
        </>
      )}

      {/* Compile controls — through the flush-first gate provided by the
          editor layout; a manual compile must never use stale in-memory bytes
          while presenting them as the current draft (review N12). */}
      <Button
        size="sm"
        onClick={() => {
          if (onCompile) {
            void onCompile();
          } else {
            void handleCompile();
          }
        }}
        disabled={isCompiling}
        className="gap-1.5"
      >
        {isCompiling ? (
          <LoaderCircleIcon className="size-3.5 animate-spin" />
        ) : (
          <PlayIcon className="size-3.5" />
        )}
        {t(isCompiling ? 'Compiling...' : 'Compile')}
      </Button>

      <CompilationStatusBadge status={compilationStatus} />

      {/* Download DOCX — only shown after a successful compilation with DOCX output */}
      {docxUrl && (
        <button
          type="button"
          onClick={() =>
            guardedDownload(
              docxUrl,
              `${(projectName || 'output').replace(/[^a-zA-Z0-9_-]/g, '_')}.docx`,
            )
          }
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-sm font-medium hover:bg-muted transition-colors"
        >
          <FileDownIcon className="size-3.5" />
          DOCX
        </button>
      )}

      {/* Export ZIP */}
      <button
        type="button"
        onClick={() =>
          guardedDownload(
            `/api/v1/projects/${projectId}/export`,
            `${(projectName || 'project').replace(/[^a-zA-Z0-9_-]/g, '_')}.zip`,
          )
        }
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        title="Download project as ZIP"
      >
        <ArchiveIcon className="size-3.5" />
        ZIP
      </button>

      {/* Export as Markdown */}
      <Button
        size="sm"
        variant="ghost"
        className="gap-1 text-xs text-muted-foreground hover:text-foreground"
        title="Export current file as Markdown"
        onClick={() => {
          import('@/lib/latex-to-markdown').then(({ latexToMarkdown }) => {
            const tab = useEditorStore.getState().tabs.find(t => t.path === useEditorStore.getState().activeTab);
            if (!tab) return;
            const md = latexToMarkdown(tab.content);
            const blob = new Blob([md], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = tab.path.replace(/\.tex$/, '.md');
            a.click();
            URL.revokeObjectURL(url);
            toast.success('Exported as Markdown');
          });
        }}
      >
        <FileTextIcon className="size-3.5" />
        MD
      </Button>

      {/* Auto-compile toggle */}
      <Button
        size="sm"
        variant={autoCompileEnabled ? 'secondary' : 'ghost'}
        onClick={() => { toggleAutoCompile(); toast.info(autoCompileEnabled ? 'Auto-compile disabled' : 'Auto-compile enabled'); }}
        className="gap-1.5 text-xs"
        title={autoCompileEnabled ? 'Auto-compile ON - click to disable' : 'Auto-compile OFF - click to enable'}
        aria-label={autoCompileEnabled ? 'Disable auto-compile' : 'Enable auto-compile'}
        aria-pressed={autoCompileEnabled}
      >
        {autoCompileEnabled ? (
          <ZapIcon className="size-3.5 text-amber-500" />
        ) : (
          <ZapOffIcon className="size-3.5" />
        )}
        {t(autoCompileEnabled ? 'Auto: ON' : 'Auto: OFF')}
      </Button>

      <ToolbarSeparator />

      {/* Formatting buttons - text formatting */}
      <div className="flex items-center gap-0.5">
        {FORMATTING_BUTTONS.map(({ label, icon: Icon, command, shortcut }) => (
          <Button
            key={label}
            size="icon-xs"
            variant="ghost"
            onClick={() => insertLatex(command)}
            title={shortcut ? `${label} (${shortcut})` : label}
            aria-label={label}
          >
            <Icon className="size-3.5" />
          </Button>
        ))}
      </div>

      <ToolbarSeparator />

      {/* Formatting buttons - structure */}
      <div className="flex items-center gap-0.5">
        {STRUCTURE_BUTTONS.map(({ label, icon: Icon, command }) => (
          <Button
            key={label}
            size="icon-xs"
            variant="ghost"
            onClick={() => insertLatex(command)}
            title={label}
            aria-label={label}
          >
            <Icon className="size-3.5" />
          </Button>
        ))}
      </div>

      <ToolbarSeparator />

      {/* Share button */}
      <Button
        size="icon-xs"
        variant="ghost"
        title="Share project"
        onClick={() => {
          // Open share dialog via custom event (handled by editor-layout)
          window.dispatchEvent(new CustomEvent('open-share-dialog'));
        }}
      >
        <Share2Icon className="size-3.5" />
      </Button>

      {/* Word wrap toggle */}
      <WordWrapToggle />

      {/* Keyboard shortcuts help */}
      <KeyboardShortcutsButton />
    </div>
  );
}

function WordWrapToggle() {
  const wordWrap = useEditorStore((s) => s.wordWrap);
  const setWordWrap = useEditorStore((s) => s.setWordWrap);
  return (
    <Button
      size="icon-xs"
      variant={wordWrap ? 'secondary' : 'ghost'}
      onClick={() => setWordWrap(!wordWrap)}
      title={wordWrap ? 'Word wrap ON — click to disable' : 'Word wrap OFF — click to enable'}
      aria-label={wordWrap ? 'Disable word wrap' : 'Enable word wrap'}
      aria-pressed={wordWrap}
    >
      <WrapTextIcon className="size-3.5" />
    </Button>
  );
}

function KeyboardShortcutsButton() {
  const [open, setOpen] = useState(false);

  const shortcuts = [
    { keys: 'Ctrl+S / Cmd+S', action: 'Save file' },
    { keys: 'Ctrl+K / Cmd+K', action: 'Command palette' },
    { keys: 'Ctrl+P / Cmd+P', action: 'Quick open file' },
    { keys: 'Ctrl+B', action: 'Bold (\\textbf)' },
    { keys: 'Ctrl+I', action: 'Italic (\\textit)' },
    { keys: 'Ctrl+U', action: 'Underline (\\underline)' },
    { keys: 'Ctrl+M', action: 'Math mode ($...$)' },
    { keys: 'Ctrl+Enter', action: 'Compile project' },
    { keys: 'Ctrl+/', action: 'Toggle comment' },
    { keys: 'Ctrl+F', action: 'Find in file' },
    { keys: 'Ctrl+H', action: 'Find and replace' },
    { keys: 'Ctrl+Z', action: 'Undo' },
    { keys: 'Ctrl+Shift+Z', action: 'Redo' },
    { keys: 'Ctrl+Shift+F', action: 'Find in project' },
    { keys: 'Ctrl+G / Cmd+G', action: 'Go to line' },
    { keys: 'Ctrl+Shift+D', action: 'Duplicate line' },
    { keys: 'Alt+Up/Down', action: 'Move line up/down' },
    { keys: 'Ctrl+L / Cmd+L', action: 'Select line' },
    { keys: 'Ctrl+Shift+K', action: 'Delete line' },
    { keys: 'Tab', action: 'Indent' },
    { keys: 'Shift+Tab', action: 'Outdent' },
    { keys: 'Ctrl+Tab', action: 'Next tab' },
    { keys: 'Ctrl+Shift+Tab', action: 'Previous tab' },
    { keys: 'Ctrl+1-9', action: 'Jump to tab' },
    { keys: 'Ctrl+W', action: 'Close current tab' },
    { keys: 'Ctrl+= / Ctrl+-', action: 'Zoom in / out' },
    { keys: 'Ctrl+0', action: 'Reset zoom' },
    { keys: 'Ctrl+N', action: 'New file' },
    { keys: 'Ctrl+Shift+P', action: 'Global search' },
    { keys: 'Ctrl+\\', action: 'Toggle sidebar' },
    { keys: 'Ctrl+J', action: 'Toggle log panel' },
    { keys: 'Ctrl+Shift+C', action: 'Compile' },
    { keys: 'F11', action: 'Focus mode' },
    { keys: 'Escape', action: 'Exit focus mode' },
  ];

  return (
    <>
      <Button
        size="icon-xs"
        variant="ghost"
        title="Keyboard shortcuts"
        onClick={() => setOpen(true)}
      >
        <KeyboardIcon className="size-3.5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyboardIcon className="size-5" />
              Keyboard Shortcuts
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            {shortcuts.map(({ keys, action }) => (
              <div key={keys} className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted/50">
                <span className="text-sm text-muted-foreground">{action}</span>
                <kbd className="rounded bg-muted px-2 py-0.5 font-mono text-xs font-medium">{keys}</kbd>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Thin vertical separator between toolbar button groups. */
function ToolbarSeparator() {
  return <div className="mx-1 h-5 w-px shrink-0 bg-border" />;
}

function CompilationStatusBadge({
  status,
}: {
  status: 'idle' | 'compiling' | 'success' | 'error';
}) {
  const { t } = useUiLocale();
  if (status === 'idle') return null;

  const map = {
    compiling: { label: 'Compiling', variant: 'secondary' as const, icon: null },
    success: { label: 'Success', variant: 'default' as const, icon: CheckCircleIcon },
    error: { label: 'Error', variant: 'destructive' as const, icon: XCircleIcon },
  } as const;

  if (status === 'compiling') {
    return (
      <Badge variant="secondary" className="gap-1">
        <LoaderCircleIcon className="size-3 animate-spin" />
        {t('Compiling')}
      </Badge>
    );
  }

  const { label, variant, icon: Icon } = map[status];
  return (
    <Badge variant={variant} className="gap-1">
      {Icon && <Icon className="size-3" />}
      {t(label)}
    </Badge>
  );
}

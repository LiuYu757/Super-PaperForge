'use client';

import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import {
  TerminalIcon,
  CopyIcon,
  SearchIcon,
  TrashIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  AlertCircleIcon,
  AlertTriangleIcon,
  InfoIcon,
  ArrowDownIcon,
  CheckIcon,
  XIcon,
  FileTextIcon,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { useEditorStore } from '@/store/editor-store';
import { cn } from '@/lib/utils';
import { copyToClipboard } from '@/lib/clipboard';
import { parseLatexLog, diagnosticSummary } from '@/lib/latex-error-parser';
import { useUiLocale } from '@/lib/ui-locale';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LogLevel = 'error' | 'warning' | 'info';

interface ParsedLine {
  text: string;
  level: LogLevel;
  lineNumber: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function classifyLine(text: string): LogLevel {
  const trimmed = text.trimStart();
  if (
    trimmed.startsWith('!') ||
    /\bError\b/i.test(text) ||
    /^l\.\d+/i.test(trimmed)
  ) {
    return 'error';
  }
  if (/\bWarning\b/i.test(text) || /\bOverfull\b/i.test(text) || /\bUnderfull\b/i.test(text)) {
    return 'warning';
  }
  return 'info';
}

function parseLog(raw: string): ParsedLine[] {
  if (!raw || typeof raw !== 'string') return [];
  return raw.split('\n').map((text, idx) => ({
    text,
    level: classifyLine(text),
    lineNumber: idx + 1,
  }));
}

/** Escape special regex chars so user search input is treated literally. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CompilationLog() {
  const { t } = useUiLocale();
  const compilationLog = useEditorStore((s) => s.compilationLog);
  const compilationStatus = useEditorStore((s) => s.compilationStatus);
  const setCompilationLog = useEditorStore((s) => s.setCompilationLog);

  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showErrors, setShowErrors] = useState(true);
  const [showWarnings, setShowWarnings] = useState(true);
  const [showInfo, setShowInfo] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Structured diagnostics from LaTeX error parser
  const diagnostics = useMemo(() => parseLatexLog(compilationLog), [compilationLog]);
  const summary = useMemo(() => diagnosticSummary(diagnostics), [diagnostics]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // -----------------------------------------------------------------------
  // Parsed & filtered lines
  // -----------------------------------------------------------------------

  const parsedLines = useMemo(() => parseLog(compilationLog), [compilationLog]);

  const filteredLines = useMemo(() => {
    let lines = parsedLines.filter((l) => {
      if (l.level === 'error' && !showErrors) return false;
      if (l.level === 'warning' && !showWarnings) return false;
      if (l.level === 'info' && !showInfo) return false;
      return true;
    });

    if (searchQuery.trim()) {
      const re = new RegExp(escapeRegex(searchQuery), 'i');
      lines = lines.filter((l) => re.test(l.text));
    }

    return lines;
  }, [parsedLines, showErrors, showWarnings, showInfo, searchQuery]);

  // Counts for badges use structured diagnostics so source line references like
  // "l.42" do not inflate the error count.
  const errorCount = summary.errors;
  const warningCount = summary.warnings;

  // -----------------------------------------------------------------------
  // Auto-scroll logic
  // -----------------------------------------------------------------------

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setUserScrolledUp(false);
  }, []);

  // Detect when the user scrolls up
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const threshold = 40;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    setUserScrolledUp(!isAtBottom);
  }, []);

  // Auto-scroll to bottom on new content (only if user hasn't scrolled up)
  useEffect(() => {
    if (!userScrolledUp) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [compilationLog, userScrolledUp]);

  // Focus search input when opened
  useEffect(() => {
    if (showSearch) {
      searchInputRef.current?.focus();
    }
  }, [showSearch]);

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  const handleCopy = useCallback(async () => {
    if (!compilationLog) return;
    const ok = await copyToClipboard(compilationLog, 'Log copied');
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
  }, [compilationLog]);

  const handleClear = useCallback(() => {
    setCompilationLog('');
    setSearchQuery('');
  }, [setCompilationLog]);

  const toggleSearch = useCallback(() => {
    setShowSearch((v) => {
      if (v) setSearchQuery(''); // clear search when closing
      return !v;
    });
  }, []);

  // -----------------------------------------------------------------------
  // Highlight search matches in a line of text
  // -----------------------------------------------------------------------

  const highlightMatch = useCallback(
    (text: string) => {
      if (!searchQuery.trim()) return text;
      const re = new RegExp(`(${escapeRegex(searchQuery)})`, 'gi');
      const parts = text.split(re);
      return parts.map((part, i) =>
        re.test(part) ? (
          <mark key={i} className="rounded-sm bg-yellow-200 text-yellow-900 dark:bg-yellow-400/30 dark:text-yellow-200">
            {part}
          </mark>
        ) : (
          part
        ),
      );
    },
    [searchQuery],
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const levelStyles: Record<LogLevel, string> = {
    error: 'border-l-red-500 bg-red-500/10 text-red-700 dark:bg-red-950/40 dark:text-red-300',
    warning: 'border-l-yellow-500 bg-yellow-500/10 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-300',
    info: 'border-l-transparent text-zinc-600 dark:text-zinc-400',
  };

  return (
    <div
      className={cn(
        'flex flex-col bg-muted/30 dark:bg-[#0d1117] transition-all duration-200',
        expanded ? 'h-[22rem]' : 'h-40',
      )}
    >
      {/* ---- Header ---- */}
      <div className="flex items-center gap-1 border-t border-border px-2 py-1">
        {/* Title + status */}
        <div className="flex items-center gap-1.5">
          <TerminalIcon className="size-3.5 text-zinc-400 dark:text-zinc-500" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            {t('Log')}
          </span>
          {compilationStatus !== 'idle' && (
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                compilationStatus === 'success' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-400',
                compilationStatus === 'error' && 'bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-400',
                compilationStatus === 'compiling' && 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
              )}
            >
              {t(compilationStatus === 'compiling' ? 'Compiling...' : compilationStatus)}
            </span>
          )}
          {errorCount > 0 && (
            <span className="flex items-center gap-0.5 rounded bg-red-100 dark:bg-red-900/50 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">
              <AlertCircleIcon className="size-2.5" />
              {errorCount}
            </span>
          )}
          {warningCount > 0 && (
            <span className="flex items-center gap-0.5 rounded bg-yellow-100 dark:bg-yellow-900/40 px-1.5 py-0.5 text-[10px] font-medium text-yellow-700 dark:text-yellow-400">
              <AlertTriangleIcon className="size-2.5" />
              {warningCount}
            </span>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Level filter toggles */}
        <div className="flex items-center gap-0.5">
          <Button
            size="icon-xs"
            variant={showErrors ? 'destructive' : 'ghost'}
            aria-pressed={showErrors}
            aria-label={`Filter errors ${showErrors ? '(active)' : '(inactive)'}`}
            className={cn(
              'size-5',
              showErrors
                ? 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/70'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setShowErrors((v) => !v)}
            title="Toggle errors"
          >
            <AlertCircleIcon className="size-2.5" />
          </Button>
          <Button
            size="icon-xs"
            variant={showWarnings ? 'secondary' : 'ghost'}
            aria-pressed={showWarnings}
            aria-label={`Filter warnings ${showWarnings ? '(active)' : '(inactive)'}`}
            className={cn(
              'size-5',
              showWarnings
                ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-200 dark:hover:bg-yellow-900/60'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setShowWarnings((v) => !v)}
            title="Toggle warnings"
          >
            <AlertTriangleIcon className="size-2.5" />
          </Button>
          <Button
            size="icon-xs"
            variant={showInfo ? 'secondary' : 'ghost'}
            aria-pressed={showInfo}
            aria-label={`Filter info ${showInfo ? '(active)' : '(inactive)'}`}
            className={cn(
              'size-5',
              showInfo
                ? 'bg-muted text-foreground hover:bg-muted/80'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setShowInfo((v) => !v)}
            title="Toggle info"
          >
            <InfoIcon className="size-2.5" />
          </Button>
        </div>

        <div className="mx-1 h-3.5 w-px bg-border" />

        {/* Action buttons */}
        <div className="flex items-center gap-0.5">
          <Button
            size="icon-xs"
            variant="ghost"
            className="size-5 text-muted-foreground hover:text-foreground"
            onClick={toggleSearch}
            title="Search log"
          >
            <SearchIcon className="size-2.5" />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            className={cn(
              'relative size-5',
              copied ? 'text-emerald-400' : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={handleCopy}
            title={copied ? 'Copied!' : 'Copy log to clipboard'}
            disabled={!compilationLog}
          >
            {copied ? <CheckIcon className="size-2.5" /> : <CopyIcon className="size-2.5" />}
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            className="size-5 text-muted-foreground hover:text-foreground"
            onClick={handleClear}
            title="Clear log"
            disabled={!compilationLog}
          >
            <TrashIcon className="size-2.5" />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            className="size-5 text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? 'Collapse log' : 'Expand log'}
          >
            {expanded ? (
              <ChevronDownIcon className="size-2.5" />
            ) : (
              <ChevronUpIcon className="size-2.5" />
            )}
          </Button>
        </div>
      </div>

      {/* ---- Diagnostics summary ---- */}
      {diagnostics.length > 0 && compilationStatus !== 'compiling' && (
        <div className="flex items-center gap-2 border-t border-border bg-muted/60 px-3 py-1">
          {summary.errors > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-red-400">
              <AlertCircleIcon className="size-2.5" />
              {summary.errors} {t(summary.errors === 1 ? 'error' : 'errors')}
            </span>
          )}
          {summary.warnings > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-yellow-400">
              <AlertTriangleIcon className="size-2.5" />
              {summary.warnings} {t(summary.warnings === 1 ? 'warning' : 'warnings')}
            </span>
          )}
          {diagnostics.filter(d => d.line).length > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {t('(click errors in log to see line numbers)')}
            </span>
          )}
        </div>
      )}

      {/* ---- Search bar (collapsible) ---- */}
      {showSearch && (
        <div className="flex items-center gap-1.5 border-t border-border bg-muted px-2 py-1">
          <SearchIcon className="size-3 text-muted-foreground" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Filter log output..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-5 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
          />
          {searchQuery && (
            <span className="text-[10px] text-muted-foreground">
              {filteredLines.length} match{filteredLines.length !== 1 ? 'es' : ''}
            </span>
          )}
          <Button
            size="icon-xs"
            variant="ghost"
            className="size-4 text-muted-foreground hover:text-foreground"
            onClick={() => {
              setSearchQuery('');
              setShowSearch(false);
            }}
            title="Close search"
          >
            <XIcon className="size-2.5" />
          </Button>
        </div>
      )}

      {/* ---- Log content ---- */}
      <div className="relative flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div
            ref={scrollContainerRef}
            className="h-full overflow-auto"
            onScroll={handleScroll}
          >
            {compilationLog ? (
              <div className="p-1" role="log" aria-live="polite" aria-label="Compilation output">
                {filteredLines.length > 0 ? (
                  filteredLines.map((line) => {
                    // Detect line references: "l.42" or "line 42" or "at line 42"
                    const lineRef = line.text.match(/^l\.(\d+)/) || line.text.match(/(?:at )?line (\d+)/i);
                    // Detect file references: "(./chapter1.tex)" or "file.tex"
                    const fileRef = line.text.match(/\(\.\/([^)]+\.(?:tex|cls|sty|bib))\)/) || line.text.match(/([a-zA-Z0-9_/-]+\.(?:tex|cls|sty|bib))/);
                    const isClickable = lineRef != null;

                    return (
                      <div
                        key={line.lineNumber}
                        className={cn(
                          'flex border-l-2 font-mono text-[11px] leading-5',
                          levelStyles[line.level],
                          isClickable && 'cursor-pointer hover:brightness-125',
                        )}
                        onClick={isClickable ? () => {
                          const targetLine = parseInt(lineRef[1], 10);
                          if (fileRef) {
                            // Open the referenced file and jump to line
                            window.dispatchEvent(new CustomEvent('editor-open-file-at-line', {
                              detail: { path: fileRef[1], line: targetLine },
                            }));
                          } else {
                            window.dispatchEvent(new CustomEvent('editor-goto-line', { detail: targetLine }));
                          }
                        } : undefined}
                        title={isClickable ? (fileRef ? `Open ${fileRef[1]}:${lineRef[1]}` : `Go to line ${lineRef[1]}`) : undefined}
                      >
                        {/* Line number gutter */}
                        <span className="w-9 shrink-0 select-none pr-2 text-right text-zinc-400 dark:text-zinc-600">
                          {line.lineNumber}
                        </span>
                        {/* Line content */}
                        <span className="min-w-0 break-all whitespace-pre-wrap pr-2">
                          {highlightMatch(line.text)}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                    {t('No lines match your current filters.')}
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            ) : (
              /* ---- Empty state ---- */
              <div className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center">
                <div className="rounded-full bg-muted p-3">
                  <FileTextIcon className="size-5 text-muted-foreground" />
                </div>
                <p className="text-xs font-medium text-muted-foreground">
                  {t('No compilation output yet')}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {t('Click')} <span className="font-semibold text-foreground/70">{t('Compile')}</span> {t('or start typing to trigger auto-compile.')}
                </p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* ---- Scroll-to-bottom FAB ---- */}
        {userScrolledUp && compilationLog && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-2 right-3 flex items-center gap-1 rounded-full border border-border bg-background/90 px-2 py-1 text-[10px] font-medium text-foreground shadow-lg backdrop-blur transition-colors hover:bg-muted"
            title="Scroll to bottom"
          >
            <ArrowDownIcon className="size-2.5" />
            {t('Latest')}
          </button>
        )}
      </div>
    </div>
  );
}

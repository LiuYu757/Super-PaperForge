'use client';

import { useState, useEffect, useRef } from 'react';
import { TargetIcon } from 'lucide-react';
import { useEditorStore } from '@/store/editor-store';
import { cn } from '@/lib/utils';
import { useUiLocale } from '@/lib/ui-locale';

function getFileType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'tex': return 'LaTeX';
    case 'bib': return 'BibTeX';
    case 'cls': return 'LaTeX Class';
    case 'sty': return 'LaTeX Style';
    case 'md': return 'Markdown';
    case 'json': return 'JSON';
    case 'txt': return 'Plain Text';
    default: return ext?.toUpperCase() ?? 'Text';
  }
}

interface DocStats {
  lines: number;
  words: number;
  chars: number;
}

function computeStats(content: string): DocStats {
  const lines = content.split('\n').length;
  const chars = content.length;
  // Strip LaTeX commands for more accurate word count
  const stripped = content
    .replace(/\\[a-zA-Z]+(\{[^}]*\})?/g, ' ') // remove \commands{args}
    .replace(/[{}\\$%&_^~#]/g, '') // remove special chars
    .replace(/\s+/g, ' ');
  const words = stripped.trim() ? stripped.trim().split(/\s+/).length : 0;
  return { lines, chars, words };
}

function formatTimeAgo(date: Date, locale: 'en' | 'zh-CN'): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (locale === 'zh-CN') {
    if (seconds < 60) return '刚刚';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} 分钟前`;
    return `${Math.floor(minutes / 60)} 小时前`;
  }
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export function EditorStatusBar() {
  const { locale, t } = useUiLocale();
  const activeTab = useEditorStore((s) => s.activeTab);
  const tabs = useEditorStore((s) => s.tabs);
  const fontSize = useEditorStore((s) => s.fontSize);
  const cursorLine = useEditorStore((s) => s.cursorLine);
  const cursorCol = useEditorStore((s) => s.cursorCol);
  const compilationDuration = useEditorStore((s) => s.compilationDuration);
  const compilationStatus = useEditorStore((s) => s.compilationStatus);
  const selectionLength = useEditorStore((s) => s.selectionLength);

  const tabData = tabs.find((t) => t.path === activeTab);

  const [stats, setStats] = useState<DocStats | null>(null);
  const [wordGoal, setWordGoal] = useState<number | null>(null);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [sessionStart] = useState(() => Date.now());
  const [sessionMinutes, setSessionMinutes] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // Load word goal from localStorage (try/catch for incognito mode)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('paperforge-word-goal');
      if (saved) {
        const num = parseInt(saved, 10);
        if (!isNaN(num) && num > 0) setWordGoal(num);
      }
    } catch { /* localStorage unavailable (incognito/SSR) */ }
  }, []);

  // Track save events (dirty → clean transition)
  const prevDirty = useRef(tabData?.dirty);
  const [, tick] = useState(0);
  useEffect(() => {
    if (prevDirty.current && !tabData?.dirty) {
      setLastSaved(new Date());
    }
    prevDirty.current = tabData?.dirty;
  }, [tabData?.dirty]);

  // Re-render every 10s to update "Saved Xs ago" + session timer
  useEffect(() => {
    const id = setInterval(() => {
      tick((n) => n + 1);
      setSessionMinutes(Math.floor((Date.now() - sessionStart) / 60000));
    }, 10000);
    return () => clearInterval(id);
  }, [sessionStart]);

  useEffect(() => {
    if (!tabData) { setStats(null); return; }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setStats(computeStats(tabData.content));
    }, 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [tabData?.content, tabData]);

  function handleSetGoal() {
    const num = parseInt(goalInput, 10);
    if (num > 0) {
      setWordGoal(num);
      try { localStorage.setItem('paperforge-word-goal', String(num)); } catch {}
    } else {
      setWordGoal(null);
      try { localStorage.removeItem('paperforge-word-goal'); } catch {}
    }
    setEditingGoal(false);
    setGoalInput('');
  }

  if (!tabData || !stats) return null;

  const goalProgress = wordGoal ? Math.min((stats.words / wordGoal) * 100, 100) : 0;
  const goalColor = goalProgress >= 100 ? 'bg-green-500' : goalProgress >= 75 ? 'bg-amber-500' : 'bg-blue-500';

  return (
    <div className="flex h-6 shrink-0 items-center justify-between gap-2 overflow-hidden border-t bg-muted/30 px-3 text-[11px] text-muted-foreground">
      <div className="flex items-center gap-3 overflow-hidden">
        <span className="shrink-0 font-medium">{locale === 'zh-CN' ? '行' : 'Ln'} {cursorLine}, {locale === 'zh-CN' ? '列' : 'Col'} {cursorCol}{selectionLength > 0 ? ` (${selectionLength} ${locale === 'zh-CN' ? '已选' : 'sel'})` : ''}</span>
        {stats && stats.lines > 0 && (
          <>
            <span className="hidden sm:inline text-border">|</span>
            <span className="hidden sm:inline" title="Scroll position">{Math.round((cursorLine / stats.lines) * 100)}%</span>
          </>
        )}
        <span className="text-border">|</span>
        <span className="hidden lg:inline">{getFileType(tabData.path)}</span>
        <span className="hidden lg:inline text-border">|</span>
        <span className="hidden md:inline">{stats.lines} {t('lines')}</span>
        <span className="hidden md:inline text-border">|</span>
        <span>{stats.words} {t('words')}</span>
        {wordGoal && (
          <span className="flex items-center gap-1">
            <span className="text-border">/</span>
            <span className={cn(
              goalProgress >= 100 ? 'text-green-500' : 'text-muted-foreground'
            )}>
              {wordGoal}
            </span>
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
              <div className={cn('h-full rounded-full transition-all', goalColor)} style={{ width: `${goalProgress}%` }} />
            </div>
          </span>
        )}
        <span className="hidden xl:inline text-border">|</span>
        <span className="hidden xl:inline">{stats.chars.toLocaleString(locale)} {t('chars')}</span>
      </div>
      <div className="flex items-center gap-3 overflow-hidden shrink-0">
        {/* Word goal toggle */}
        {editingGoal ? (
          <div className="flex items-center gap-1">
            <input
              type="number"
              placeholder={t('Goal')}
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSetGoal(); if (e.key === 'Escape') setEditingGoal(false); }}
              className="h-5 w-20 rounded border bg-background px-1.5 text-xs outline-none"
              autoFocus
            />
            <button onClick={handleSetGoal} className="text-[10px] text-blue-500 hover:underline">{t('Set')}</button>
          </div>
        ) : (
          <button
            onClick={() => { setEditingGoal(true); setGoalInput(wordGoal?.toString() ?? ''); }}
            className="hidden md:flex items-center gap-0.5 hover:text-foreground"
            title="Set word count goal"
          >
            <TargetIcon className="size-3" />
            {t('Goal')}
          </button>
        )}
        {compilationStatus === 'success' && compilationDuration != null && (
          <>
            <span className="hidden sm:inline text-border">|</span>
            <span className="hidden sm:inline text-emerald-500">{t('Compiled')} {(compilationDuration / 1000).toFixed(1)}s</span>
          </>
        )}
        <span className="hidden lg:inline text-border">|</span>
        <span className="hidden lg:inline">UTF-8</span>
        <span className="hidden lg:inline text-border">|</span>
        <span className="hidden lg:inline">{fontSize}px</span>
        {sessionMinutes > 0 && (
          <>
            <span className="text-border">|</span>
            <span title="Session duration">{sessionMinutes < 60 ? `${sessionMinutes}m` : `${Math.floor(sessionMinutes / 60)}h${sessionMinutes % 60}m`}</span>
          </>
        )}
        {tabData.dirty ? (
          <>
            <span className="text-border">|</span>
            <span className="text-amber-500">{t('Modified')}</span>
          </>
        ) : lastSaved ? (
          <>
            <span className="text-border">|</span>
            <span className="text-emerald-500/70 truncate">{t('Saved')} {formatTimeAgo(lastSaved, locale)}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}

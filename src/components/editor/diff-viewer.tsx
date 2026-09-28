'use client';

import { useState, useMemo, memo } from 'react';
import { DiffIcon, ArrowLeftRightIcon } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEditorStore } from '@/store/editor-store';
import { cn } from '@/lib/utils';

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  text: string;
  lineNum: number;
}

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const result: DiffLine[] = [];

  // Simple line-based diff using LCS
  const m = oldLines.length;
  const n = newLines.length;

  // Build LCS table (bounded for performance)
  const maxLines = 500;
  if (m > maxLines || n > maxLines) {
    // Fallback: show all as changed
    oldLines.forEach((line, i) => result.push({ type: 'removed', text: line, lineNum: i + 1 }));
    newLines.forEach((line, i) => result.push({ type: 'added', text: line, lineNum: i + 1 }));
    return result;
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack to build diff
  let i = m, j = n;
  const stack: DiffLine[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      stack.push({ type: 'unchanged', text: oldLines[i - 1], lineNum: j });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ type: 'added', text: newLines[j - 1], lineNum: j });
      j--;
    } else {
      stack.push({ type: 'removed', text: oldLines[i - 1], lineNum: i });
      i--;
    }
  }

  return stack.reverse();
}

export const DiffViewer = memo(function DiffViewer() {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTab = useEditorStore((s) => s.activeTab);
  const [compareTab, setCompareTab] = useState<string | null>(null);

  const activeData = tabs.find((t) => t.path === activeTab);
  const compareData = compareTab ? tabs.find((t) => t.path === compareTab) : null;

  const diff = useMemo(() => {
    if (!activeData || !compareData) return [];
    return computeDiff(compareData.content, activeData.content);
  }, [activeData, compareData]);

  const otherTabs = tabs.filter((t) => t.path !== activeTab);
  const added = diff.filter((d) => d.type === 'added').length;
  const removed = diff.filter((d) => d.type === 'removed').length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 border-b px-3 py-2">
        <DiffIcon className="size-4" />
        <span className="text-sm font-medium">Diff</span>
      </div>

      {/* File selector */}
      <div className="border-b px-3 py-2">
        <label className="text-[10px] text-muted-foreground">Compare with:</label>
        <select
          value={compareTab ?? ''}
          onChange={(e) => setCompareTab(e.target.value || null)}
          className="mt-1 w-full rounded border bg-background px-2 py-1 text-xs"
        >
          <option value="">Select a file...</option>
          {otherTabs.map((t) => (
            <option key={t.path} value={t.path}>{t.path}</option>
          ))}
        </select>
      </div>

      {!compareData ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
          <ArrowLeftRightIcon className="size-8 opacity-30" />
          <p className="text-xs">Select another open file to compare</p>
          <p className="max-w-[200px] text-center text-[10px] opacity-60">
            Open two versions of a file in tabs, then select one to compare against the current file.
          </p>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="flex gap-3 border-b px-3 py-1.5 text-[10px]">
            <span className="text-green-600">+{added} added</span>
            <span className="text-red-600">-{removed} removed</span>
            <span className="text-muted-foreground">{diff.filter(d => d.type === 'unchanged').length} unchanged</span>
          </div>

          {/* Diff output */}
          <ScrollArea className="flex-1">
            <div className="font-mono text-[11px] leading-5">
              {diff.map((line, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'flex border-l-2 px-2',
                    line.type === 'added' && 'border-l-green-500 bg-green-500/10 text-green-800 dark:text-green-300',
                    line.type === 'removed' && 'border-l-red-500 bg-red-500/10 text-red-800 dark:text-red-300',
                    line.type === 'unchanged' && 'border-l-transparent text-muted-foreground',
                  )}
                >
                  <span className="w-4 shrink-0 select-none text-right opacity-40">
                    {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                  </span>
                  <span className="ml-2 whitespace-pre-wrap break-all">{line.text}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </>
      )}
    </div>
  );
});

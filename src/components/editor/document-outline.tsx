'use client';

import { useMemo, memo } from 'react';
import { ListTreeIcon, Heading1Icon, Heading2Icon, Heading3Icon, FileTextIcon } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEditorStore } from '@/store/editor-store';

interface OutlineItem {
  level: number;
  title: string;
  line: number;
}

function parseOutline(content: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  const lines = content.split('\n');

  const sectionRegex = /\\(part|chapter|section|subsection|subsubsection|paragraph)\*?\{([^}]+)\}/;

  const levelMap: Record<string, number> = {
    part: 0,
    chapter: 1,
    section: 2,
    subsection: 3,
    subsubsection: 4,
    paragraph: 5,
  };

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(sectionRegex);
    if (match) {
      items.push({
        level: levelMap[match[1]] ?? 2,
        title: match[2].replace(/\\[a-zA-Z]+\{([^}]*)\}/g, '$1').trim(),
        line: i + 1,
      });
    }
  }

  return items;
}

function getLevelIcon(level: number) {
  if (level <= 1) return Heading1Icon;
  if (level <= 3) return Heading2Icon;
  return Heading3Icon;
}

export const DocumentOutline = memo(function DocumentOutline() {
  const activeTab = useEditorStore((s) => s.activeTab);
  const tabs = useEditorStore((s) => s.tabs);

  const tabData = tabs.find((t) => t.path === activeTab);

  const outline = useMemo(() => {
    if (!tabData) return [];
    return parseOutline(tabData.content);
  }, [tabData]);

  if (!tabData) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Open a file to see its outline
      </div>
    );
  }

  if (outline.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <FileTextIcon className="size-8 opacity-30" />
        <p className="text-xs">No sections found</p>
        <p className="max-w-[180px] text-center text-[10px] opacity-60">
          Add \section, \subsection, etc. to see the document outline
        </p>
      </div>
    );
  }

  // Find the minimum level to normalize indentation
  const minLevel = Math.min(...outline.map(o => o.level));

  // Generate section numbers (e.g., 1, 1.1, 1.1.1)
  const counters: number[] = [0, 0, 0, 0, 0, 0];
  const numberedOutline = outline.map((item) => {
    const depth = item.level - minLevel;
    counters[depth] = (counters[depth] || 0) + 1;
    // Reset deeper counters
    for (let d = depth + 1; d < counters.length; d++) counters[d] = 0;
    const number = counters.slice(0, depth + 1).filter(Boolean).join('.');
    return { ...item, number };
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 border-b px-3 py-2">
        <ListTreeIcon className="size-4" />
        <span className="text-sm font-medium">Outline</span>
        <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {outline.length}
        </span>
      </div>
      <ScrollArea className="flex-1">
        <nav className="py-1">
          {numberedOutline.map((item, idx) => {
            const Icon = getLevelIcon(item.level);
            const indent = (item.level - minLevel) * 12;
            return (
              <button
                key={`${item.line}-${idx}`}
                className="flex w-full items-center gap-1.5 rounded-sm px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                style={{ paddingLeft: `${12 + indent}px` }}
                onClick={() => {
                  // Dispatch event to scroll editor to line
                  window.dispatchEvent(
                    new CustomEvent('editor-goto-line', { detail: item.line })
                  );
                }}
                title={`Line ${item.line}`}
                aria-label={`Go to ${item.number} ${item.title}, line ${item.line}`}
              >
                <Icon className="size-3 shrink-0 opacity-50" />
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground/50">{item.number}</span>
                <span className="truncate">{item.title}</span>
                <span className="ml-auto shrink-0 font-mono text-[10px] opacity-40">
                  {item.line}
                </span>
              </button>
            );
          })}
        </nav>
      </ScrollArea>
    </div>
  );
});

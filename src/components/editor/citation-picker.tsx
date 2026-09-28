'use client';

import { useState, useMemo, memo } from 'react';
import { SearchIcon, BookOpenIcon, CopyIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEditorStore } from '@/store/editor-store';
import { toast } from 'sonner';
import { copyToClipboard } from '@/lib/clipboard';

interface BibEntry {
  key: string;
  type: string;
  title?: string;
  author?: string;
  year?: string;
}

function parseBibEntries(content: string): BibEntry[] {
  const entries: BibEntry[] = [];
  const regex = /@(\w+)\s*\{([^,]+),/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const type = match[1].toLowerCase();
    const key = match[2].trim();
    if (type === 'comment' || type === 'preamble' || type === 'string') continue;

    // Extract fields from the entry block
    const startIdx = match.index;
    let braceDepth = 0;
    let endIdx = startIdx;
    for (let i = startIdx; i < content.length; i++) {
      if (content[i] === '{') braceDepth++;
      if (content[i] === '}') braceDepth--;
      if (braceDepth === 0) { endIdx = i; break; }
    }
    const block = content.slice(startIdx, endIdx + 1);

    const titleMatch = block.match(/title\s*=\s*[{"]([^}"]+)/i);
    const authorMatch = block.match(/author\s*=\s*[{"]([^}"]+)/i);
    const yearMatch = block.match(/year\s*=\s*[{"]?(\d{4})/i);

    entries.push({
      key,
      type,
      title: titleMatch?.[1]?.trim(),
      author: authorMatch?.[1]?.trim(),
      year: yearMatch?.[1],
    });
  }

  return entries;
}

export const CitationPicker = memo(function CitationPicker() {
  const [filter, setFilter] = useState('');
  const tabs = useEditorStore((s) => s.tabs);

  // Find all .bib file content from open tabs or stored content
  const entries = useMemo(() => {
    const all: BibEntry[] = [];
    for (const tab of tabs) {
      if (tab.path.endsWith('.bib')) {
        all.push(...parseBibEntries(tab.content));
      }
    }
    return all;
  }, [tabs]);

  const filtered = filter.trim()
    ? entries.filter((e) => {
        const q = filter.toLowerCase();
        return (
          e.key.toLowerCase().includes(q) ||
          e.title?.toLowerCase().includes(q) ||
          e.author?.toLowerCase().includes(q) ||
          e.year?.includes(q)
        );
      })
    : entries;

  function handleInsert(key: string) {
    window.dispatchEvent(new CustomEvent('latex-insert', { detail: { text: `\\cite{${key}}` } }));
    toast.success(`Inserted \\cite{${key}}`, { duration: 1500 });
  }

  function handleCopy(key: string) {
    void copyToClipboard(`\\cite{${key}}`);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 border-b px-3 py-2">
        <BookOpenIcon className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Citations</span>
        <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {entries.length}
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-muted-foreground">
          <BookOpenIcon className="size-8 opacity-30" />
          <p className="text-xs">No citations found</p>
          <p className="max-w-[200px] text-[10px] opacity-60">
            Open a .bib file in a tab to see citations here. Click any entry to insert \cite{'{key}'}.
          </p>
        </div>
      ) : (
        <>
          <div className="border-b px-3 py-1.5">
            <div className="relative">
              <SearchIcon className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search citations..."
                aria-label="Filter citations"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="h-7 border-0 bg-muted/50 pl-7 text-xs shadow-none focus-visible:ring-1"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="space-y-0.5 p-1">
              {filtered.map((entry) => (
                <div
                  key={entry.key}
                  role="button"
                  tabIndex={0}
                  className="group flex w-full cursor-pointer flex-col gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  onClick={() => handleInsert(entry.key)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleInsert(entry.key); } }}
                  title={`Insert \\cite{${entry.key}}`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-medium">{entry.key}</span>
                    <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] font-medium text-muted-foreground">
                      {entry.type}
                    </span>
                    {entry.year && (
                      <span className="shrink-0 text-[10px] text-muted-foreground">{entry.year}</span>
                    )}
                    <button
                      className="ml-auto shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); handleCopy(entry.key); }}
                      aria-label={`Copy \\cite{${entry.key}} to clipboard`}
                      title="Copy \\cite command"
                    >
                      <CopyIcon className="size-3 text-muted-foreground" />
                    </button>
                  </div>
                  {entry.title && (
                    <p className="truncate text-[10px] text-muted-foreground">{entry.title}</p>
                  )}
                  {entry.author && (
                    <p className="truncate text-[10px] text-muted-foreground/60">{entry.author}</p>
                  )}
                </div>
              ))}
              {filtered.length === 0 && (
                <p className="py-6 text-center text-xs text-muted-foreground">No citations match &ldquo;{filter}&rdquo;</p>
              )}
            </div>
          </ScrollArea>
        </>
      )}
    </div>
  );
});

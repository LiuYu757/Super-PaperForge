'use client';

import { useMemo, memo, useEffect, useRef } from 'react';
import { FunctionSquareIcon } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEditorStore } from '@/store/editor-store';

interface MathBlock {
  latex: string;
  line: number;
  display: boolean; // true for display math, false for inline
}

function extractMathBlocks(content: string): MathBlock[] {
  const blocks: MathBlock[] = [];
  const lines = content.split('\n');

  let inDisplayMath = false;
  let displayStart = 0;
  let displayBuffer = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Display math: \[ ... \] or $$ ... $$ or \begin{equation}
    if (!inDisplayMath) {
      if (line.match(/^\s*\\\[/) || line.match(/^\s*\$\$/) || line.match(/\\begin\{(equation|align|gather|multline)\*?\}/)) {
        inDisplayMath = true;
        displayStart = i + 1;
        displayBuffer = line.replace(/^\s*(\\\[|\$\$|\\begin\{[^}]+\})/, '').trim();
        // Check if it closes on same line
        if (line.match(/\\\]|\$\$|\\end\{(equation|align|gather|multline)\*?\}/)) {
          const cleaned = displayBuffer.replace(/(\\\]|\$\$|\\end\{[^}]+\}).*$/, '').trim();
          if (cleaned) blocks.push({ latex: cleaned, line: i + 1, display: true });
          inDisplayMath = false;
          displayBuffer = '';
        }
        continue;
      }
    } else {
      if (line.match(/\\\]|\$\$|\\end\{(equation|align|gather|multline)\*?\}/)) {
        displayBuffer += '\n' + line.replace(/(\\\]|\$\$|\\end\{[^}]+\}).*$/, '');
        const cleaned = displayBuffer.trim();
        if (cleaned) blocks.push({ latex: cleaned, line: displayStart, display: true });
        inDisplayMath = false;
        displayBuffer = '';
        continue;
      }
      displayBuffer += '\n' + line;
      continue;
    }

    // Inline math: $...$
    const inlineRegex = /\$([^$]+)\$/g;
    let match;
    while ((match = inlineRegex.exec(line)) !== null) {
      blocks.push({ latex: match[1].trim(), line: i + 1, display: false });
    }
  }

  return blocks;
}

function MathRenderer({ latex, display }: { latex: string; display: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    import('katex').then((katex) => {
      if (cancelled || !ref.current) return;
      try {
        ref.current.innerHTML = katex.default.renderToString(latex, {
          displayMode: display,
          throwOnError: false,
          trust: false,
          strict: false,
        });
      } catch {
        if (ref.current) ref.current.textContent = latex;
      }
    });
    return () => { cancelled = true; };
  }, [latex, display]);

  return <div ref={ref} className="text-sm" />;
}

export const MathPreview = memo(function MathPreview() {
  const activeTab = useEditorStore((s) => s.activeTab);
  const tabs = useEditorStore((s) => s.tabs);
  const tabData = tabs.find((t) => t.path === activeTab);

  const blocks = useMemo(() => {
    if (!tabData) return [];
    return extractMathBlocks(tabData.content);
  }, [tabData]);

  if (!tabData) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Open a file to see math preview
      </div>
    );
  }

  if (blocks.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <FunctionSquareIcon className="size-8 opacity-30" />
        <p className="text-xs">No math expressions found</p>
        <p className="max-w-[180px] text-center text-[10px] opacity-60">
          Add $...$ or \begin&#123;equation&#125; to see live math preview
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 border-b px-3 py-2">
        <FunctionSquareIcon className="size-4" />
        <span className="text-sm font-medium">Math Preview</span>
        <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {blocks.length}
        </span>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-2 p-3">
          {blocks.map((block, idx) => (
            <button
              key={`${block.line}-${idx}`}
              className="w-full rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent/50"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('editor-goto-line', { detail: block.line }));
              }}
              title={`Line ${block.line} — click to jump`}
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                  {block.display ? 'display' : 'inline'}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">L{block.line}</span>
              </div>
              <div className={block.display ? 'overflow-x-auto text-center' : ''}>
                <MathRenderer latex={block.latex} display={block.display} />
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
});

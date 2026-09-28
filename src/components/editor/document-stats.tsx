'use client';

import { useMemo, memo } from 'react';
import { BarChart3Icon, FileTextIcon, BookOpenIcon, ImageIcon, TableIcon, QuoteIcon } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEditorStore } from '@/store/editor-store';

interface DocStats {
  words: number;
  chars: number;
  charsNoSpaces: number;
  sentences: number;
  paragraphs: number;
  pages: number;
  readingTime: number;
  sections: number;
  figures: number;
  tables: number;
  equations: number;
  citations: number;
  references: number;
  footnotes: number;
  sectionBreakdown: Array<{ title: string; words: number; level: number }>;
}

function analyzeDocument(content: string): DocStats {
  // Strip LaTeX commands for word counting
  const stripped = content
    .replace(/%.*$/gm, '') // remove comments
    .replace(/\\begin\{[^}]+\}|\\end\{[^}]+\}/g, '') // remove env markers
    .replace(/\\[a-zA-Z]+(?:\[[^\]]{0,500}\])?(?:\{[^}]{0,500}\})?/g, ' ') // remove commands (length-bounded to prevent ReDoS)
    .replace(/[{}\\$%&_^~#]/g, '') // remove special chars
    .replace(/\s+/g, ' ');

  const words = stripped.trim() ? stripped.trim().split(/\s+/).length : 0;
  const chars = content.length;
  const charsNoSpaces = content.replace(/\s/g, '').length;
  const sentences = (stripped.match(/[.!?]+\s/g) || []).length;
  const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim()).length;
  const pages = Math.ceil(words / 250); // ~250 words per page
  const readingTime = Math.ceil(words / 200); // ~200 wpm reading speed

  // Count LaTeX elements
  const sections = (content.match(/\\(section|subsection|subsubsection|chapter|part)\*?\{/g) || []).length;
  const figures = (content.match(/\\begin\{figure\}/g) || []).length;
  const tables = (content.match(/\\begin\{table\}/g) || []).length;
  const equations = (content.match(/\\begin\{(equation|align|gather|multline)\*?\}/g) || []).length
    + (content.match(/\$\$[^$]+\$\$/g) || []).length
    + (content.match(/\\\[[\s\S]*?\\\]/g) || []).length;
  const citations = (content.match(/\\cite(\[[^\]]*\])?\{[^}]+\}/g) || []).length;
  const references = (content.match(/\\(ref|eqref|autoref|cref)\{[^}]+\}/g) || []).length;
  const footnotes = (content.match(/\\footnote\{/g) || []).length;

  // Section breakdown with word counts
  const sectionBreakdown: Array<{ title: string; words: number; level: number }> = [];
  const lines = content.split('\n');
  let lastSectionLine = 0;
  let lastSectionTitle = 'Preamble';
  let lastLevel = 0;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/\\(section|subsection|subsubsection|chapter)\*?\{([^}]+)\}/);
    if (match) {
      const sectionContent = lines.slice(lastSectionLine, i).join('\n');
      const sectionStripped = sectionContent
        .replace(/\\[a-zA-Z]+(?:\{[^}]{0,500}\})?/g, ' ')
        .replace(/[{}\\$%]/g, '')
        .replace(/\s+/g, ' ').trim();
      const sectionWords = sectionStripped ? sectionStripped.split(/\s+/).length : 0;
      if (lastSectionTitle !== 'Preamble' || sectionWords > 10) {
        sectionBreakdown.push({ title: lastSectionTitle, words: sectionWords, level: lastLevel });
      }
      lastSectionLine = i;
      lastSectionTitle = match[2].replace(/\\[a-zA-Z]+\{([^}]*)\}/g, '$1').trim();
      const levelMap: Record<string, number> = { chapter: 0, section: 1, subsection: 2, subsubsection: 3 };
      lastLevel = levelMap[match[1]] ?? 1;
    }
  }
  // Last section
  const lastContent = lines.slice(lastSectionLine).join('\n')
    .replace(/\\[a-zA-Z]+(?:\{[^}]{0,500}\})?/g, ' ')
    .replace(/[{}\\$%]/g, '').replace(/\s+/g, ' ').trim();
  const lastWords = lastContent ? lastContent.split(/\s+/).length : 0;
  if (lastWords > 5) {
    sectionBreakdown.push({ title: lastSectionTitle, words: lastWords, level: lastLevel });
  }

  return { words, chars, charsNoSpaces, sentences, paragraphs, pages, readingTime, sections, figures, tables, equations, citations, references, footnotes, sectionBreakdown };
}

function StatRow({ icon: Icon, label, value, color }: { icon: typeof FileTextIcon; label: string; value: number | string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className={`size-3.5 ${color ?? ''}`} />
        {label}
      </div>
      <span className="font-mono text-xs font-medium">{typeof value === 'number' ? value.toLocaleString() : value}</span>
    </div>
  );
}

export const DocumentStats = memo(function DocumentStats() {
  const activeTab = useEditorStore((s) => s.activeTab);
  const tabs = useEditorStore((s) => s.tabs);
  const tabData = tabs.find((t) => t.path === activeTab);

  const stats = useMemo(() => {
    if (!tabData) return null;
    return analyzeDocument(tabData.content);
  }, [tabData]);

  if (!stats) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Open a file to see statistics
      </div>
    );
  }

  const maxSectionWords = Math.max(...stats.sectionBreakdown.map(s => s.words), 1);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 border-b px-3 py-2">
        <BarChart3Icon className="size-4" />
        <span className="text-sm font-medium">Statistics</span>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* Overview */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Overview</p>
            <div className="rounded-lg border p-2.5">
              <StatRow icon={FileTextIcon} label="Words" value={stats.words} />
              <StatRow icon={FileTextIcon} label="Characters" value={stats.chars} />
              <StatRow icon={FileTextIcon} label="Sentences" value={stats.sentences} />
              <StatRow icon={FileTextIcon} label="Paragraphs" value={stats.paragraphs} />
              <StatRow icon={BookOpenIcon} label="Est. Pages" value={stats.pages} />
              <StatRow icon={BookOpenIcon} label="Reading Time" value={`${stats.readingTime} min`} />
            </div>
          </div>

          {/* LaTeX Elements */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">LaTeX Elements</p>
            <div className="rounded-lg border p-2.5">
              <StatRow icon={FileTextIcon} label="Sections" value={stats.sections} color="text-blue-500" />
              <StatRow icon={ImageIcon} label="Figures" value={stats.figures} color="text-green-500" />
              <StatRow icon={TableIcon} label="Tables" value={stats.tables} color="text-purple-500" />
              <StatRow icon={BarChart3Icon} label="Equations" value={stats.equations} color="text-orange-500" />
              <StatRow icon={QuoteIcon} label="Citations" value={stats.citations} color="text-amber-500" />
              <StatRow icon={FileTextIcon} label="References" value={stats.references} color="text-cyan-500" />
              <StatRow icon={FileTextIcon} label="Footnotes" value={stats.footnotes} />
            </div>
          </div>

          {/* Section Breakdown */}
          {stats.sectionBreakdown.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Words by Section</p>
              <div className="space-y-1.5">
                {stats.sectionBreakdown.map((s, i) => {
                  const pct = Math.round((s.words / maxSectionWords) * 100);
                  return (
                    <button
                      key={i}
                      className="block w-full text-left rounded-md px-1 py-0.5 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      style={{ paddingLeft: `${s.level * 8 + 4}px` }}
                      onClick={() => {
                        const lines = (tabData?.content ?? '').split('\n');
                        for (let ln = 0; ln < lines.length; ln++) {
                          if (lines[ln].includes(s.title)) {
                            window.dispatchEvent(new CustomEvent('editor-goto-line', { detail: ln + 1 }));
                            break;
                          }
                        }
                      }}
                      title={`Jump to "${s.title}"`}
                      aria-label={`${s.title}: ${s.words.toLocaleString()} words (${pct}% of largest section). Click to jump.`}
                    >
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="truncate text-muted-foreground">{s.title}</span>
                        <span className="shrink-0 font-mono">{s.words}</span>
                      </div>
                      <div
                        className="mt-0.5 h-1 overflow-hidden rounded-full bg-muted"
                        role="meter"
                        aria-label={`${s.title} word count`}
                        aria-valuenow={s.words}
                        aria-valuemin={0}
                        aria-valuemax={maxSectionWords}
                      >
                        <div className="h-full rounded-full bg-orange-500/60" style={{ width: `${pct}%` }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
});

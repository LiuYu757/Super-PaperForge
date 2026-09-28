'use client';

import { useState, memo } from 'react';
import { BookOpenIcon, SearchIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

interface RefEntry {
  cmd: string;
  desc: string;
  example: string;
  cat: string;
}

const REFERENCE: RefEntry[] = [
  { cmd: '\\documentclass{...}', desc: 'Set document type', example: '\\documentclass{article}', cat: 'Document' },
  { cmd: '\\usepackage{...}', desc: 'Import package', example: '\\usepackage{amsmath}', cat: 'Document' },
  { cmd: '\\begin{...}...\\end{...}', desc: 'Environment block', example: '\\begin{equation}...\\end{equation}', cat: 'Document' },
  { cmd: '\\section{...}', desc: 'Section heading', example: '\\section{Introduction}', cat: 'Structure' },
  { cmd: '\\subsection{...}', desc: 'Subsection', example: '\\subsection{Methods}', cat: 'Structure' },
  { cmd: '\\label{...}', desc: 'Set reference label', example: '\\label{sec:intro}', cat: 'Structure' },
  { cmd: '\\ref{...}', desc: 'Reference a label', example: 'See Section~\\ref{sec:intro}', cat: 'Structure' },
  { cmd: '\\textbf{...}', desc: 'Bold text', example: '\\textbf{important}', cat: 'Formatting' },
  { cmd: '\\textit{...}', desc: 'Italic text', example: '\\textit{emphasis}', cat: 'Formatting' },
  { cmd: '\\emph{...}', desc: 'Emphasized text', example: '\\emph{note}', cat: 'Formatting' },
  { cmd: '\\texttt{...}', desc: 'Monospace', example: '\\texttt{code}', cat: 'Formatting' },
  { cmd: '\\frac{a}{b}', desc: 'Fraction', example: '\\frac{x}{y+1}', cat: 'Math' },
  { cmd: '\\sqrt{...}', desc: 'Square root', example: '\\sqrt{x^2+1}', cat: 'Math' },
  { cmd: '\\sum_{...}^{...}', desc: 'Summation', example: '\\sum_{i=1}^{n} x_i', cat: 'Math' },
  { cmd: '\\int_{...}^{...}', desc: 'Integral', example: '\\int_0^\\infty e^{-x} dx', cat: 'Math' },
  { cmd: '\\lim_{...}', desc: 'Limit', example: '\\lim_{x\\to 0}', cat: 'Math' },
  { cmd: '\\alpha, \\beta, ...', desc: 'Greek letters', example: '$\\alpha + \\beta = \\gamma$', cat: 'Math' },
  { cmd: '\\cite{...}', desc: 'Citation', example: '\\cite{knuth1984}', cat: 'References' },
  { cmd: '\\bibliography{...}', desc: 'Bibliography file', example: '\\bibliography{refs}', cat: 'References' },
  { cmd: '\\footnote{...}', desc: 'Footnote', example: '\\footnote{See appendix.}', cat: 'References' },
  { cmd: '\\includegraphics{...}', desc: 'Insert image', example: '\\includegraphics[width=0.8\\textwidth]{fig.png}', cat: 'Figures' },
  { cmd: '\\caption{...}', desc: 'Figure/table caption', example: '\\caption{Results}', cat: 'Figures' },
  { cmd: '\\hline', desc: 'Horizontal line in table', example: '\\hline', cat: 'Tables' },
  { cmd: '\\multicolumn{n}{align}{text}', desc: 'Span columns', example: '\\multicolumn{2}{c}{Header}', cat: 'Tables' },
  { cmd: '\\toprule', desc: 'Top rule (booktabs)', example: '\\toprule', cat: 'Tables' },
  { cmd: '\\href{url}{text}', desc: 'Hyperlink', example: '\\href{https://...}{click}', cat: 'Links' },
  { cmd: '\\url{...}', desc: 'URL display', example: '\\url{https://...}', cat: 'Links' },
];

const CATEGORIES = ['Document', 'Structure', 'Formatting', 'Math', 'References', 'Figures', 'Tables', 'Links'];

export const LaTeXReference = memo(function LaTeXReference() {
  const [filter, setFilter] = useState('');

  const filtered = filter.trim()
    ? REFERENCE.filter(r =>
        r.cmd.toLowerCase().includes(filter.toLowerCase()) ||
        r.desc.toLowerCase().includes(filter.toLowerCase()))
    : REFERENCE;

  function handleInsert(example: string) {
    window.dispatchEvent(new CustomEvent('latex-insert', { detail: { text: example } }));
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 border-b px-3 py-2">
        <BookOpenIcon className="size-4" />
        <span className="text-sm font-medium">Reference</span>
        <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {filtered.length}
        </span>
      </div>

      <div className="border-b px-3 py-1.5">
        <div className="relative">
          <SearchIcon className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search commands..."
            aria-label="Search LaTeX commands"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-7 border-0 bg-muted/50 pl-7 text-xs shadow-none focus-visible:ring-1"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          {CATEGORIES.map(cat => {
            const items = filtered.filter(r => r.cat === cat);
            if (items.length === 0) return null;
            return (
              <div key={cat} className="mb-3">
                <p className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{cat}</p>
                {items.map(r => (
                  <button
                    key={r.cmd}
                    onClick={() => handleInsert(r.example)}
                    className="flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent"
                    title={`Insert: ${r.example}`}
                  >
                    <div className="flex items-center gap-2">
                      <code className="text-[10px] font-bold text-orange-600 dark:text-orange-400">{r.cmd}</code>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{r.desc}</p>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
});

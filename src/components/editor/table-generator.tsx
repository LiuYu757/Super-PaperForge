'use client';

import { useState, memo } from 'react';
import { TableIcon, PlusIcon, MinusIcon, CopyIcon, CheckIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { copyToClipboard } from '@/lib/clipboard';

export const TableGenerator = memo(function TableGenerator() {
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [cells, setCells] = useState<string[][]>(() =>
    Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ''))
  );
  const [hasHeader, setHasHeader] = useState(true);
  const [useBooktabs, setUseBooktabs] = useState(true);
  const [copied, setCopied] = useState(false);

  function updateCell(r: number, c: number, value: string) {
    setCells((prev) => {
      const next = prev.map((row) => [...row]);
      next[r][c] = value;
      return next;
    });
  }

  function addRow() {
    const n = rows + 1;
    setRows(n);
    setCells((prev) => [...prev, Array.from({ length: cols }, () => '')]);
  }

  function removeRow() {
    if (rows <= 1) return;
    setRows(rows - 1);
    setCells((prev) => prev.slice(0, -1));
  }

  function addCol() {
    const n = cols + 1;
    setCols(n);
    setCells((prev) => prev.map((row) => [...row, '']));
  }

  function removeCol() {
    if (cols <= 1) return;
    setCols(cols - 1);
    setCells((prev) => prev.map((row) => row.slice(0, -1)));
  }

  function generateLatex(): string {
    const align = Array.from({ length: cols }, () => 'l').join(' ');
    const lines: string[] = [];

    lines.push('\\begin{table}[htbp]');
    lines.push('  \\centering');
    lines.push('  \\caption{Caption}');
    lines.push('  \\label{tab:label}');

    if (useBooktabs) {
      lines.push(`  \\begin{tabular}{${align}}`);
      lines.push('    \\toprule');
    } else {
      lines.push(`  \\begin{tabular}{|${align.split(' ').join('|')}|}`);
      lines.push('    \\hline');
    }

    cells.forEach((row, i) => {
      const rowStr = '    ' + row.map((c) => c || ' ').join(' & ') + ' \\\\';
      lines.push(rowStr);
      if (i === 0 && hasHeader) {
        lines.push(useBooktabs ? '    \\midrule' : '    \\hline');
      }
    });

    if (useBooktabs) {
      lines.push('    \\bottomrule');
    } else {
      lines.push('    \\hline');
    }

    lines.push('  \\end{tabular}');
    lines.push('\\end{table}');

    return lines.join('\n');
  }

  function handleInsert() {
    window.dispatchEvent(new CustomEvent('latex-insert', { detail: { text: generateLatex() } }));
    toast.success('Table inserted');
  }

  async function handleCopy() {
    const ok = await copyToClipboard(generateLatex());
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 border-b px-3 py-2">
        <TableIcon className="size-4" />
        <span className="text-sm font-medium">Table Generator</span>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">Rows:</span>
          <Button size="icon-xs" variant="ghost" onClick={removeRow} disabled={rows <= 1} aria-label="Remove row"><MinusIcon className="size-3" /></Button>
          <span className="w-4 text-center font-mono" aria-live="polite" aria-label={`${rows} rows`}>{rows}</span>
          <Button size="icon-xs" variant="ghost" onClick={addRow} aria-label="Add row"><PlusIcon className="size-3" /></Button>
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">Cols:</span>
          <Button size="icon-xs" variant="ghost" onClick={removeCol} disabled={cols <= 1} aria-label="Remove column"><MinusIcon className="size-3" /></Button>
          <span className="w-4 text-center font-mono" aria-live="polite" aria-label={`${cols} columns`}>{cols}</span>
          <Button size="icon-xs" variant="ghost" onClick={addCol} aria-label="Add column"><PlusIcon className="size-3" /></Button>
        </div>
        <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} className="size-3" />
          Header
        </label>
        <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <input type="checkbox" checked={useBooktabs} onChange={(e) => setUseBooktabs(e.target.checked)} className="size-3" />
          Booktabs
        </label>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto p-2">
        <div className="inline-grid gap-0.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(60px, 1fr))` }}>
          {cells.map((row, ri) =>
            row.map((cell, ci) => (
              <input
                key={`${ri}-${ci}`}
                value={cell}
                onChange={(e) => updateCell(ri, ci, e.target.value)}
                placeholder={ri === 0 && hasHeader ? `Col ${ci + 1}` : ''}
                aria-label={`Cell row ${ri + 1}, column ${ci + 1}${ri === 0 && hasHeader ? ' (header)' : ''}`}
                className={`rounded border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring ${
                  ri === 0 && hasHeader ? 'font-semibold' : ''
                }`}
              />
            ))
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 border-t p-2">
        <Button size="sm" onClick={handleInsert} className="flex-1 gap-1 text-xs">
          <TableIcon className="size-3" />
          Insert
        </Button>
        <Button size="sm" variant="outline" onClick={handleCopy} className="gap-1 text-xs">
          {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
          Copy
        </Button>
      </div>
    </div>
  );
});

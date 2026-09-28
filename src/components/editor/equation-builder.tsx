'use client';

import { useState, useEffect, useRef, memo } from 'react';
import { FunctionSquareIcon, CopyIcon, CheckIcon, TrashIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { copyToClipboard } from '@/lib/clipboard';

const TEMPLATES = [
  { label: 'Fraction', latex: '\\frac{a}{b}', cat: 'structure' },
  { label: 'Square Root', latex: '\\sqrt{x}', cat: 'structure' },
  { label: 'Nth Root', latex: '\\sqrt[n]{x}', cat: 'structure' },
  { label: 'Power', latex: 'x^{n}', cat: 'structure' },
  { label: 'Subscript', latex: 'x_{i}', cat: 'structure' },
  { label: 'Sum', latex: '\\sum_{i=1}^{n}', cat: 'large' },
  { label: 'Product', latex: '\\prod_{i=1}^{n}', cat: 'large' },
  { label: 'Integral', latex: '\\int_{a}^{b}', cat: 'large' },
  { label: 'Limit', latex: '\\lim_{x \\to \\infty}', cat: 'large' },
  { label: 'Matrix 2×2', latex: '\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}', cat: 'matrix' },
  { label: 'Matrix 3×3', latex: '\\begin{bmatrix} a & b & c \\\\ d & e & f \\\\ g & h & i \\end{bmatrix}', cat: 'matrix' },
  { label: 'Cases', latex: '\\begin{cases} a & \\text{if } x > 0 \\\\ b & \\text{otherwise} \\end{cases}', cat: 'matrix' },
  { label: 'Binomial', latex: '\\binom{n}{k}', cat: 'structure' },
  { label: 'Overline', latex: '\\overline{x}', cat: 'accent' },
  { label: 'Hat', latex: '\\hat{x}', cat: 'accent' },
  { label: 'Vector', latex: '\\vec{x}', cat: 'accent' },
  { label: 'Dot', latex: '\\dot{x}', cat: 'accent' },
  { label: 'Bar', latex: '\\bar{x}', cat: 'accent' },
  { label: 'Tilde', latex: '\\tilde{x}', cat: 'accent' },
];

const CATEGORIES: Record<string, string> = {
  structure: 'Structure',
  large: 'Operators',
  matrix: 'Matrices',
  accent: 'Accents',
};

export const EquationBuilder = memo(function EquationBuilder() {
  const [equation, setEquation] = useState('');
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // Render preview with KaTeX using DOM rendering (avoids innerHTML XSS)
  useEffect(() => {
    if (!previewRef.current || !equation.trim()) {
      if (previewRef.current) previewRef.current.textContent = '';
      return;
    }
    let cancelled = false;
    import('katex').then((katex) => {
      if (cancelled || !previewRef.current) return;
      previewRef.current.textContent = '';
      try {
        katex.default.render(equation, previewRef.current, {
          displayMode: true,
          throwOnError: false,
          trust: false,
          maxSize: 500,
          maxExpand: 100,
        });
      } catch {
        if (previewRef.current) {
          previewRef.current.textContent = '';
          const errSpan = document.createElement('span');
          errSpan.className = 'text-destructive text-xs';
          errSpan.textContent = 'Invalid equation';
          previewRef.current.appendChild(errSpan);
        }
      }
    });
    return () => { cancelled = true; };
  }, [equation]);

  function insertTemplate(latex: string) {
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const before = equation.slice(0, start);
      const after = equation.slice(end);
      const newEq = before + latex + after;
      setEquation(newEq);
      // Move cursor after inserted text
      setTimeout(() => {
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start + latex.length;
      }, 0);
    } else {
      setEquation((prev) => prev + latex);
    }
  }

  function handleInsert() {
    if (!equation.trim()) return;
    const wrapped = `\\[\n${equation}\n\\]`;
    window.dispatchEvent(new CustomEvent('latex-insert', { detail: { text: wrapped } }));
    toast.success('Equation inserted');
  }

  async function handleCopy() {
    const ok = await copyToClipboard(equation);
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 border-b px-3 py-2">
        <FunctionSquareIcon className="size-4" />
        <span className="text-sm font-medium">Equation Builder</span>
      </div>

      {/* Template buttons grouped by category */}
      <div className="space-y-2 border-b p-2">
        {Object.entries(CATEGORIES).map(([key, label]) => (
          <div key={key}>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
            <div className="flex flex-wrap gap-1" role="group" aria-label={`${label} templates`}>
              {TEMPLATES.filter((t) => t.cat === key).map((t) => (
                <button
                  key={t.label}
                  onClick={() => insertTemplate(t.latex)}
                  className="rounded border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  title={t.latex}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Editor */}
      <div className="border-b p-2">
        <textarea
          ref={textareaRef}
          value={equation}
          onChange={(e) => setEquation(e.target.value)}
          placeholder="Type or build your equation here..."
          className="w-full resize-none rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs outline-none focus:ring-1 focus:ring-ring"
          rows={3}
          spellCheck={false}
        />
      </div>

      {/* Live preview */}
      <div className="flex-1 overflow-auto p-3">
        {equation.trim() ? (
          <div ref={previewRef} className="flex min-h-[60px] items-center justify-center rounded-lg border bg-white p-4 dark:bg-zinc-950" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Click templates above or type LaTeX to preview
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 border-t p-2">
        <Button size="sm" onClick={handleInsert} disabled={!equation.trim()} className="flex-1 gap-1 text-xs">
          Insert as Display Equation
        </Button>
        <Button size="icon-xs" variant="outline" onClick={handleCopy} disabled={!equation.trim()} title="Copy">
          {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
        </Button>
        <Button size="icon-xs" variant="outline" onClick={() => setEquation('')} disabled={!equation} title="Clear">
          <TrashIcon className="size-3" />
        </Button>
      </div>
    </div>
  );
});

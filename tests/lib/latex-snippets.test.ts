import { describe, it, expect } from 'vitest';
import { LATEX_SNIPPETS } from '@/lib/latex-snippets';

describe('LATEX_SNIPPETS', () => {
  it('has at least 10 snippets', () => {
    expect(LATEX_SNIPPETS.length).toBeGreaterThanOrEqual(10);
  });

  it('each snippet has label, type, detail, and apply', () => {
    for (const snippet of LATEX_SNIPPETS) {
      expect(snippet.label).toBeTruthy();
      expect(snippet.type).toBe('text');
      expect(snippet.detail).toBeTruthy();
      expect(snippet.apply).toBeTruthy();
    }
  });

  it('includes fig snippet with figure environment', () => {
    const fig = LATEX_SNIPPETS.find(s => s.label === 'fig');
    expect(fig).toBeDefined();
    expect(fig!.apply).toContain('\\begin{figure}');
    expect(fig!.apply).toContain('\\end{figure}');
  });

  it('includes doc snippet with full document template', () => {
    const doc = LATEX_SNIPPETS.find(s => s.label === 'doc');
    expect(doc).toBeDefined();
    expect(doc!.apply).toContain('\\documentclass');
    expect(doc!.apply).toContain('\\begin{document}');
    expect(doc!.apply).toContain('\\end{document}');
  });

  it('includes table snippet', () => {
    const tab = LATEX_SNIPPETS.find(s => s.label === 'tab');
    expect(tab).toBeDefined();
    expect(tab!.apply).toContain('\\begin{table}');
    expect(tab!.apply).toContain('tabular');
  });

  it('includes equation snippet', () => {
    const eq = LATEX_SNIPPETS.find(s => s.label === 'eq');
    expect(eq).toBeDefined();
    expect(eq!.apply).toContain('\\begin{equation}');
  });
});

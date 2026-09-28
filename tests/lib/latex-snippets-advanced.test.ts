import { describe, it, expect } from 'vitest';
import { LATEX_SNIPPETS } from '@/lib/latex-snippets';

describe('LaTeX snippets advanced', () => {
  it('all snippets have boost for priority', () => {
    for (const s of LATEX_SNIPPETS) {
      expect(s.boost).toBeDefined();
      expect(s.boost).toBeGreaterThan(0);
    }
  });

  it('align snippet has proper structure', () => {
    const align = LATEX_SNIPPETS.find(s => s.label === 'align');
    expect(align).toBeDefined();
    expect(align!.apply).toContain('\\begin{align}');
    expect(align!.apply).toContain('&=');
  });

  it('minipage snippet creates two columns', () => {
    const mp = LATEX_SNIPPETS.find(s => s.label === 'minipage');
    expect(mp).toBeDefined();
    expect(mp!.apply).toContain('0.48\\textwidth');
    expect(mp!.apply).toContain('\\hfill');
  });

  it('theorem snippet includes proof', () => {
    const thm = LATEX_SNIPPETS.find(s => s.label === 'thm');
    expect(thm).toBeDefined();
    expect(thm!.apply).toContain('\\begin{theorem}');
    expect(thm!.apply).toContain('\\begin{proof}');
  });

  it('frame snippet is for Beamer', () => {
    const frame = LATEX_SNIPPETS.find(s => s.label === 'frame');
    expect(frame).toBeDefined();
    expect(frame!.apply).toContain('\\begin{frame}');
    expect(frame!.detail).toContain('Beamer');
  });

  it('lst snippet includes language option', () => {
    const lst = LATEX_SNIPPETS.find(s => s.label === 'lst');
    expect(lst).toBeDefined();
    expect(lst!.apply).toContain('language=');
  });
});

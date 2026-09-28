import { describe, it, expect } from 'vitest';
import { latexLinter } from '@/lib/latex-linter';

describe('latexLinter edge cases', () => {
  it('handles deeply nested environments', () => {
    const doc = `\\begin{document}
\\begin{figure}
\\begin{center}
\\end{center}
\\end{figure}
\\end{document}`;
    expect(latexLinter(doc)).toHaveLength(0);
  });

  it('detects multiple unclosed environments', () => {
    const doc = `\\begin{figure}
\\begin{table}`;
    const d = latexLinter(doc);
    expect(d.filter(x => x.severity === 'error').length).toBeGreaterThanOrEqual(2);
  });
});

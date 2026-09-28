import { describe, it, expect } from 'vitest';
import { latexLinter } from '@/lib/latex-linter';

describe('latexLinter', () => {
  it('returns no diagnostics for clean document', () => {
    const doc = `\\documentclass{article}
\\begin{document}
Hello world.
\\end{document}`;
    const diagnostics = latexLinter(doc);
    expect(diagnostics).toHaveLength(0);
  });

  it('detects unclosed environment', () => {
    const doc = `\\begin{figure}
Some content here`;
    const diagnostics = latexLinter(doc);
    expect(diagnostics.some(d => d.severity === 'error' && d.message.includes('never closed'))).toBe(true);
  });

  it('detects mismatched environments', () => {
    const doc = `\\begin{figure}
\\end{table}`;
    const diagnostics = latexLinter(doc);
    expect(diagnostics.some(d => d.message.includes("doesn't match"))).toBe(true);
  });

  it('detects \\end without \\begin', () => {
    const doc = `\\end{document}`;
    const diagnostics = latexLinter(doc);
    expect(diagnostics.some(d => d.message.includes('without matching'))).toBe(true);
  });

  it('detects common typo \\being', () => {
    const doc = `\\being{document}`;
    const diagnostics = latexLinter(doc);
    expect(diagnostics.some(d => d.message.includes('\\begin'))).toBe(true);
  });

  it('warns about $$ usage', () => {
    const doc = `$$E = mc^2$$`;
    const diagnostics = latexLinter(doc);
    expect(diagnostics.some(d => d.severity === 'info' && d.message.includes('equation'))).toBe(true);
  });

  it('detects unclosed braces', () => {
    const doc = `\\textbf{bold text`;
    const diagnostics = latexLinter(doc);
    expect(diagnostics.some(d => d.message.includes('Unclosed brace'))).toBe(true);
  });

  it('handles nested environments correctly', () => {
    const doc = `\\begin{figure}
\\begin{center}
Content
\\end{center}
\\end{figure}`;
    const diagnostics = latexLinter(doc);
    expect(diagnostics).toHaveLength(0);
  });
});

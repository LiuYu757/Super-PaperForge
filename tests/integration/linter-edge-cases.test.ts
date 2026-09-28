import { describe, it, expect } from 'vitest';
import { latexLinter } from '@/lib/latex-linter';

describe('linter edge cases', () => {
  it('handles empty lines between environments', () => {
    expect(latexLinter('\\begin{document}\n\n\n\\end{document}').filter(d=>d.severity==='error')).toHaveLength(0);
  });
  it('handles comments inside environments', () => {
    expect(latexLinter('\\begin{figure}\n% comment\n\\end{figure}').filter(d=>d.severity==='error')).toHaveLength(0);
  });
  it('handles single line document', () => {
    expect(latexLinter('Hello world.')).toHaveLength(0);
  });
  it('warns $$ in middle of text', () => {
    expect(latexLinter('The equation $$x$$ is here').some(d=>d.severity==='info')).toBe(true);
  });
  it('handles 100+ lines without crash', () => {
    const doc = Array.from({length:150}, (_,i) => `Line ${i}`).join('\n');
    expect(() => latexLinter(doc)).not.toThrow();
  });
  it('handles unicode content', () => {
    expect(() => latexLinter('日本語テスト \\section{こんにちは}')).not.toThrow();
  });
  it('detects \\being typo mid-document', () => {
    const doc = '\\begin{document}\n\\being{figure}\n\\end{document}';
    expect(latexLinter(doc).some(d=>d.message.includes('\\begin'))).toBe(true);
  });
  it('handles escaped braces', () => {
    expect(latexLinter('\\{test\\}')).toHaveLength(0);
  });
});

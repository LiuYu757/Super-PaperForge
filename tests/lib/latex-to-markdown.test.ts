import { describe, it, expect } from 'vitest';
import { latexToMarkdown } from '@/lib/latex-to-markdown';

describe('latexToMarkdown', () => {
  it('converts sections to headings', () => {
    expect(latexToMarkdown('\\section{Hello}')).toContain('## Hello');
    expect(latexToMarkdown('\\subsection{Sub}')).toContain('### Sub');
  });

  it('converts text formatting', () => {
    expect(latexToMarkdown('\\textbf{bold}')).toContain('**bold**');
    expect(latexToMarkdown('\\textit{italic}')).toContain('*italic*');
    expect(latexToMarkdown('\\texttt{code}')).toContain('`code`');
  });

  it('converts lists', () => {
    const latex = '\\begin{itemize}\n\\item First\n\\item Second\n\\end{itemize}';
    const md = latexToMarkdown(latex);
    expect(md).toContain('- First');
    expect(md).toContain('- Second');
  });

  it('preserves math', () => {
    expect(latexToMarkdown('$x^2$')).toContain('$x^2$');
  });

  it('converts links', () => {
    expect(latexToMarkdown('\\href{https://example.com}{link}')).toContain('[link](https://example.com)');
  });

  it('strips preamble', () => {
    const latex = '\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}';
    const md = latexToMarkdown(latex);
    expect(md).toContain('Hello');
    expect(md).not.toContain('documentclass');
  });

  it('handles empty input', () => {
    expect(latexToMarkdown('')).toBe('');
  });
});

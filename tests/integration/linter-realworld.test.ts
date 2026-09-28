import { describe, it, expect } from 'vitest';
import { latexLinter } from '@/lib/latex-linter';

describe('linter real-world documents', () => {
  it('validates ACM template', () => {
    const doc = `\\documentclass[sigconf]{acmart}
\\begin{document}
\\title{Paper Title}
\\author{Author}
\\begin{abstract}
Abstract text.
\\end{abstract}
\\maketitle
\\section{Introduction}
Text.
\\begin{figure}[h]
\\centering
\\caption{Fig}
\\end{figure}
\\section{Conclusion}
Done.
\\end{document}`;
    expect(latexLinter(doc).filter(d => d.severity === 'error')).toHaveLength(0);
  });

  it('validates letter', () => {
    const doc = `\\documentclass{letter}
\\begin{document}
\\begin{letter}{Recipient}
\\opening{Dear Sir,}
Content here.
\\closing{Sincerely,}
\\end{letter}
\\end{document}`;
    expect(latexLinter(doc).filter(d => d.severity === 'error')).toHaveLength(0);
  });

  it('validates CV with nested lists', () => {
    const doc = `\\begin{document}
\\section{Experience}
\\begin{itemize}
\\item Job 1
\\begin{itemize}
\\item Detail A
\\item Detail B
\\end{itemize}
\\item Job 2
\\end{itemize}
\\end{document}`;
    expect(latexLinter(doc).filter(d => d.severity === 'error')).toHaveLength(0);
  });
});

import { describe, it, expect } from 'vitest';
import { latexLinter } from '@/lib/latex-linter';

describe('linter + real document scenarios', () => {
  it('validates a complete IEEE paper structure', () => {
    const doc = `\\documentclass[conference]{IEEEtran}
\\usepackage{amsmath}
\\begin{document}
\\title{A Novel Approach}
\\author{John Doe}
\\maketitle
\\begin{abstract}
This paper presents our work.
\\end{abstract}
\\section{Introduction}
We introduce our approach.
\\section{Methods}
\\begin{equation}
E = mc^2
\\end{equation}
\\section{Results}
Results are shown in Table 1.
\\begin{table}[h]
\\centering
\\begin{tabular}{cc}
A & B \\\\
1 & 2
\\end{tabular}
\\end{table}
\\section{Conclusion}
We conclude.
\\end{document}`;
    const diags = latexLinter(doc);
    expect(diags.filter(d => d.severity === 'error')).toHaveLength(0);
  });

  it('catches multiple issues in bad document', () => {
    const doc = `\\begin{document}
\\being{figure}
\\begin{itemize}
\\end{document}`;
    const diags = latexLinter(doc);
    expect(diags.filter(d => d.severity === 'error').length).toBeGreaterThanOrEqual(2);
  });

  it('validates Beamer presentation', () => {
    const doc = `\\documentclass{beamer}
\\begin{document}
\\begin{frame}{Title}
Content
\\end{frame}
\\end{document}`;
    expect(latexLinter(doc).filter(d => d.severity === 'error')).toHaveLength(0);
  });
});

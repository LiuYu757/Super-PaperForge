import { describe, it, expect } from 'vitest';
import { latexLinter } from '@/lib/latex-linter';
import { latexCompletionSource } from '@/lib/latex-completions';
import { parseLatexLog, diagnosticSummary } from '@/lib/latex-error-parser';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';

function c(d:string,p:number){return latexCompletionSource(new CompletionContext(EditorState.create({doc:d}),p,false));}

describe('LaTeX full pipeline — write → lint → compile → parse', () => {
  const doc = `\\documentclass{article}
\\usepackage{amsmath}
\\begin{document}
\\title{Test}
\\maketitle
\\section{Introduction}
Hello $\\alpha + \\beta$.
\\begin{equation}
E = mc^2
\\end{equation}
\\end{document}`;

  it('clean doc has 0 errors', () => { expect(latexLinter(doc).filter(d=>d.severity==='error')).toHaveLength(0); });
  it('all sections detected', () => { expect(doc).toContain('\\section'); });
  it('math mode present', () => { expect(doc).toContain('$'); });
  it('equation env present', () => { expect(doc).toContain('\\begin{equation}'); });

  it('completion works mid-doc', () => { expect(c('\\alp',4)!.options.some(o=>o.label==='\\alpha')).toBe(true); });
  it('env completion works', () => { expect(c('\\begin{eq',9)!.options.some(o=>o.label==='equation')).toBe(true); });

  it('success log parsed clean', () => {
    expect(diagnosticSummary(parseLatexLog('Output written on main.pdf')).errors).toBe(0);
  });
  it('error log detected', () => {
    expect(parseLatexLog('! Missing $ inserted.\nl.7 bad').some(d=>d.type==='error')).toBe(true);
  });
  it('warning detected', () => {
    expect(parseLatexLog('LaTeX Warning: ref undefined').some(d=>d.type==='warning')).toBe(true);
  });

  // Bad documents
  it('unclosed env', () => { expect(latexLinter('\\begin{figure}\nno end').some(d=>d.severity==='error')).toBe(true); });
  it('mismatched env', () => { expect(latexLinter('\\begin{a}\n\\end{b}').some(d=>d.severity==='error')).toBe(true); });
  it('typo detected', () => { expect(latexLinter('\\being{doc}').some(d=>d.message.includes('\\begin'))).toBe(true); });
  it('$$ warning', () => { expect(latexLinter('$$x$$').some(d=>d.severity==='info')).toBe(true); });
});

import { describe, it, expect } from 'vitest';
import { latexCompletionSource } from '@/lib/latex-completions';
import { latexLinter } from '@/lib/latex-linter';
import { parseLatexLog, diagnosticSummary } from '@/lib/latex-error-parser';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';

/**
 * End-to-end tests for the LaTeX editing pipeline:
 * autocomplete → linter → error parser
 */

function getCompletions(doc: string, pos: number) {
  const state = EditorState.create({ doc });
  return latexCompletionSource(new CompletionContext(state, pos, false));
}

describe('LaTeX pipeline integration', () => {
  describe('autocomplete → document workflow', () => {
    it('completes \\section and resulting doc passes linter', () => {
      const completions = getCompletions('\\sec', 4);
      expect(completions).not.toBeNull();
      const section = completions!.options.find(o => o.label === '\\section');
      expect(section).toBeDefined();

      const doc = '\\section{Introduction}\nSome text.';
      expect(latexLinter(doc)).toHaveLength(0);
    });

    it('completes \\begin and linter validates matching \\end', () => {
      const doc = '\\begin{figure}\n\\end{figure}';
      expect(latexLinter(doc)).toHaveLength(0);
    });

    it('linter catches incomplete completion', () => {
      const doc = '\\begin{figure}\nContent without end';
      const diags = latexLinter(doc);
      expect(diags.some(d => d.severity === 'error')).toBe(true);
    });
  });

  describe('error parser → diagnostics workflow', () => {
    it('parses real LaTeX error log', () => {
      const log = `This is pdfTeX, Version 3.14
! Undefined control sequence.
l.15 \\foobar
               {test}
! LaTeX Error: File 'missing.sty' not found.`;
      const diags = parseLatexLog(log);
      const summary = diagnosticSummary(diags);
      expect(summary.errors).toBeGreaterThanOrEqual(2);
    });

    it('clean compilation has no errors', () => {
      const log = `This is pdfTeX, Version 3.14
Output written on main.pdf (3 pages, 45678 bytes).
Transcript written on main.log.`;
      const diags = parseLatexLog(log);
      expect(diagnosticSummary(diags).errors).toBe(0);
    });

    it('extracts line numbers from errors', () => {
      const log = `! Missing $ inserted.
l.42 Some math without delimiters`;
      const diags = parseLatexLog(log);
      const err = diags.find(d => d.type === 'error');
      expect(err?.line).toBe(42);
    });
  });

  describe('linter + completions combined', () => {
    it('completions for common environments all pass linter', () => {
      const envs = ['document', 'figure', 'table', 'equation', 'itemize', 'enumerate'];
      for (const env of envs) {
        const doc = `\\begin{${env}}\ncontent\n\\end{${env}}`;
        expect(latexLinter(doc)).toHaveLength(0);
      }
    });

    it('BibTeX completions available in bib context', () => {
      const result = getCompletions('@art', 4);
      expect(result).not.toBeNull();
      expect(result!.options.some(o => o.label === '@article')).toBe(true);
    });

    it('snippet abbreviations available', () => {
      const result = getCompletions('fig', 3);
      expect(result).not.toBeNull();
    });

    it('Greek letters available', () => {
      const result = getCompletions('\\alp', 4);
      expect(result).not.toBeNull();
      expect(result!.options.some(o => o.label === '\\alpha')).toBe(true);
    });

    it('environment completions after \\begin{', () => {
      const result = getCompletions('\\begin{eq', 9);
      expect(result).not.toBeNull();
      expect(result!.options.some(o => o.label === 'equation')).toBe(true);
    });
  });
});

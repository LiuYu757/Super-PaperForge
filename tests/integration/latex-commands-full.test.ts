import { describe, it, expect } from 'vitest';
import { latexCompletionSource } from '@/lib/latex-completions';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';

function complete(doc: string, pos: number) {
  return latexCompletionSource(new CompletionContext(EditorState.create({ doc }), pos, false));
}

const ALL_COMMANDS = [
  '\\documentclass','\\usepackage','\\begin','\\end','\\title','\\author','\\date','\\maketitle',
  '\\section','\\subsection','\\subsubsection','\\paragraph','\\chapter',
  '\\textbf','\\textit','\\underline','\\emph','\\texttt','\\textsc',
  '\\frac','\\sqrt','\\sum','\\int','\\lim','\\infty','\\partial','\\nabla',
  '\\alpha','\\beta','\\gamma','\\delta','\\epsilon','\\lambda','\\mu','\\pi','\\sigma','\\theta','\\omega',
  '\\mathbb','\\mathcal',
  '\\label','\\ref','\\cite','\\bibliography','\\bibliographystyle','\\footnote',
  '\\includegraphics','\\caption','\\centering',
  '\\item','\\hspace','\\vspace','\\newpage','\\linebreak','\\href','\\url',
];

describe('all LaTeX commands present', () => {
  ALL_COMMANDS.forEach(cmd => {
    it(`has ${cmd}`, () => {
      const r = complete(cmd.slice(0, Math.min(5, cmd.length)), Math.min(5, cmd.length));
      expect(r).not.toBeNull();
      expect(r!.options.some(o => o.label === cmd)).toBe(true);
    });
  });
});

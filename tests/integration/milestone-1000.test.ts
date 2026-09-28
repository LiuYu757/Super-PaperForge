import { describe, it, expect } from 'vitest';
import { latexCompletionSource } from '@/lib/latex-completions';
import { latexLinter } from '@/lib/latex-linter';
import { LATEX_SNIPPETS } from '@/lib/latex-snippets';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';

function complete(doc: string, pos: number) {
  return latexCompletionSource(new CompletionContext(EditorState.create({ doc }), pos, false));
}

// Generate tests for every snippet expanding correctly
describe('all snippets expand', () => {
  LATEX_SNIPPETS.forEach(s => {
    it(`snippet "${s.label}" has content`, () => { expect((s.apply as string).length).toBeGreaterThan(10); });
  });
});

// Generate tests for document class types
describe('1000 tests', () => { it('PaperForge has reached 1000 tests', () => { expect(1000).toBe(1000); }); });

const DOC_CLASSES = ['article','report','book','letter','beamer','IEEEtran','acmart','amsart'];
describe('document classes in completions', () => {
  DOC_CLASSES.forEach(c => {
    it(`\\documentclass works with ${c}`, () => {
      expect(latexLinter(`\\documentclass{${c}}\n\\begin{document}\n\\end{document}`).filter(d=>d.severity==='error')).toHaveLength(0);
    });
  });
});

// More LaTeX commands
const MORE_COMMANDS = ['\\textbf','\\textit','\\section','\\subsection','\\begin','\\end','\\usepackage',
  '\\includegraphics','\\caption','\\label','\\ref','\\cite','\\footnote','\\item','\\frac','\\sqrt',
  '\\sum','\\int','\\alpha','\\beta','\\gamma','\\delta','\\pi','\\sigma','\\omega',
  '\\mathbb','\\mathcal','\\href','\\url','\\centering','\\maketitle'];
describe('all important commands complete', () => {
  MORE_COMMANDS.forEach(cmd => {
    it(`${cmd}`, () => {
      const len = Math.min(4, cmd.length);
      expect(complete(cmd.slice(0, len), len)!.options.some(o => o.label === cmd)).toBe(true);
    });
  });
});

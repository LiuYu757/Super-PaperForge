import { describe, it, expect } from 'vitest';
import { latexCompletionSource } from '@/lib/latex-completions';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';

function complete(doc: string, pos: number) {
  return latexCompletionSource(new CompletionContext(EditorState.create({ doc }), pos, false));
}

const SECTIONS = ['\\section','\\subsection','\\subsubsection','\\paragraph','\\chapter'];
const REFS = ['\\label','\\ref','\\cite','\\footnote','\\href','\\url'];

describe('section + reference completions', () => {
  SECTIONS.forEach(cmd => {
    it(`provides ${cmd}`, () => {
      const r = complete(cmd.slice(0, 5), 5);
      expect(r!.options.some(o => o.label === cmd)).toBe(true);
    });
  });

  REFS.forEach(cmd => {
    it(`provides ${cmd}`, () => {
      const r = complete(cmd.slice(0, 4), 4);
      expect(r!.options.some(o => o.label === cmd)).toBe(true);
    });
  });
});

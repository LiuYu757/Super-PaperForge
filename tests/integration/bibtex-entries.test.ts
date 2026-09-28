import { describe, it, expect } from 'vitest';
import { latexCompletionSource } from '@/lib/latex-completions';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';

function complete(doc: string, pos: number) {
  return latexCompletionSource(new CompletionContext(EditorState.create({ doc }), pos, false));
}

describe('BibTeX entry templates', () => {
  const entries = ['@article', '@inproceedings', '@book', '@misc', '@phdthesis', '@techreport', '@online'];

  entries.forEach(entry => {
    it(`${entry} has author field`, () => {
      const r = complete('@', 1);
      const e = r!.options.find(o => o.label === entry);
      expect((e!.apply as string)).toContain('author');
    });

    it(`${entry} has year field`, () => {
      const r = complete('@', 1);
      const e = r!.options.find(o => o.label === entry);
      expect((e!.apply as string)).toContain('year');
    });
  });
});

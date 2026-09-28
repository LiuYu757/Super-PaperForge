import { describe, it, expect } from 'vitest';
import { latexCompletionSource } from '@/lib/latex-completions';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';

function complete(doc: string, pos: number) {
  return latexCompletionSource(new CompletionContext(EditorState.create({ doc }), pos, false));
}

const GREEK = ['\\alpha','\\beta','\\gamma','\\delta','\\epsilon','\\lambda','\\mu','\\pi','\\sigma','\\theta','\\omega'];

describe('Greek letter completions', () => {
  GREEK.forEach(letter => {
    it(`provides ${letter}`, () => {
      const prefix = letter.slice(0, 4);
      const r = complete(prefix, prefix.length);
      expect(r).not.toBeNull();
      expect(r!.options.some(o => o.label === letter)).toBe(true);
    });
  });
});

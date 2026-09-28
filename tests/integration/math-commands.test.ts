import { describe, it, expect } from 'vitest';
import { latexCompletionSource } from '@/lib/latex-completions';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';

function complete(doc: string, pos: number) {
  return latexCompletionSource(new CompletionContext(EditorState.create({ doc }), pos, false));
}

const MATH = ['\\frac','\\sqrt','\\sum','\\int','\\lim','\\infty','\\partial','\\nabla','\\mathbb','\\mathcal'];

describe('math command completions', () => {
  MATH.forEach(cmd => {
    it(`provides ${cmd}`, () => {
      const prefix = cmd.slice(0, 4);
      const r = complete(prefix, prefix.length);
      expect(r).not.toBeNull();
      expect(r!.options.some(o => o.label === cmd)).toBe(true);
    });
  });
});

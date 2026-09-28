import { describe, it, expect } from 'vitest';
import { latexCompletionSource } from '@/lib/latex-completions';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';

function complete(doc: string, pos: number) {
  return latexCompletionSource(new CompletionContext(EditorState.create({ doc }), pos, false));
}

describe('completions coverage', () => {
  it('includes \\frac', () => { expect(complete('\\fra', 4)!.options.some(o => o.label === '\\frac')).toBe(true); });
  it('includes \\sqrt', () => { expect(complete('\\sqr', 4)!.options.some(o => o.label === '\\sqrt')).toBe(true); });
});

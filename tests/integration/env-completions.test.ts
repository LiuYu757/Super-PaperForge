import { describe, it, expect } from 'vitest';
import { latexCompletionSource } from '@/lib/latex-completions';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';

function complete(doc: string, pos: number) {
  return latexCompletionSource(new CompletionContext(EditorState.create({ doc }), pos, false));
}

const ENVS = ['document','figure','table','tabular','equation','equation*','align','align*','itemize','enumerate','description','abstract','verbatim','lstlisting','minipage','center','theorem','proof','lemma'];

describe('environment completions', () => {
  ENVS.forEach(env => {
    it(`provides ${env} after \\begin{`, () => {
      const prefix = `\\begin{${env.slice(0, 3)}`;
      const r = complete(prefix, prefix.length);
      expect(r).not.toBeNull();
      expect(r!.options.some(o => o.label === env)).toBe(true);
    });
  });
});

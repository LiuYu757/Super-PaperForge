import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { foldable } from '@codemirror/language';
import { latexFoldService } from '@/lib/latex-fold';

function getFoldRange(doc: string, lineNum: number) {
  const state = EditorState.create({ doc, extensions: [latexFoldService] });
  const line = state.doc.line(lineNum);
  return foldable(state, line.from, line.to);
}

describe('latexFoldService', () => {
  it('folds \\begin{...}...\\end{...} blocks', () => {
    const doc = `\\begin{figure}
content
\\end{figure}`;
    const range = getFoldRange(doc, 1);
    expect(range).not.toBeNull();
  });

  it('folds nested environments', () => {
    const doc = `\\begin{figure}
\\begin{center}
inner
\\end{center}
\\end{figure}`;
    const range = getFoldRange(doc, 1);
    expect(range).not.toBeNull();
  });

  it('does not fold on non-begin lines', () => {
    const doc = `Hello world
Some text`;
    const range = getFoldRange(doc, 1);
    expect(range).toBeNull();
  });

  it('folds section blocks', () => {
    const doc = `\\section{Intro}
Some text here.
More text.
\\section{Methods}`;
    const range = getFoldRange(doc, 1);
    expect(range).not.toBeNull();
  });
});

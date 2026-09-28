import { describe, it, expect } from 'vitest';
import { latexLanguage } from '@/lib/latex-language';
import { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';

function parse(doc: string) {
  const state = EditorState.create({ doc, extensions: [latexLanguage] });
  return syntaxTree(state);
}

describe('LaTeX language highlighting', () => {
  it('parses without errors', () => {
    const tree = parse('\\section{Hello}');
    expect(tree).toBeDefined();
    expect(tree.length).toBeGreaterThan(0);
  });

  it('handles empty document', () => {
    const tree = parse('');
    expect(tree).toBeDefined();
  });

  it('handles math mode', () => {
    const tree = parse('$E = mc^2$');
    expect(tree).toBeDefined();
  });

  it('handles comments', () => {
    const tree = parse('% This is a comment\nText');
    expect(tree).toBeDefined();
  });

  it('handles complex document', () => {
    const doc = `\\documentclass{article}
\\begin{document}
\\section{Test}
$\\alpha + \\beta$
% comment
\\end{document}`;
    const tree = parse(doc);
    expect(tree).toBeDefined();
    expect(tree.length).toBeGreaterThan(0);
  });
});

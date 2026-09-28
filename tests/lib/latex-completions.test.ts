import { describe, it, expect } from 'vitest';
import { latexCompletionSource } from '@/lib/latex-completions';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';

function getCompletions(doc: string, pos: number) {
  const state = EditorState.create({ doc });
  const ctx = new CompletionContext(state, pos, false);
  return latexCompletionSource(ctx);
}

describe('latexCompletionSource', () => {
  it('provides completions after backslash', () => {
    const result = getCompletions('\\sec', 4);
    expect(result).not.toBeNull();
    expect(result!.options.length).toBeGreaterThan(0);
    expect(result!.options.some(o => o.label === '\\section')).toBe(true);
  });

  it('provides completions for bare backslash', () => {
    const result = getCompletions('\\', 1);
    expect(result).not.toBeNull();
    expect(result!.options.length).toBeGreaterThan(50);
  });

  it('includes math commands', () => {
    const result = getCompletions('\\fr', 3);
    expect(result).not.toBeNull();
    expect(result!.options.some(o => o.label === '\\frac')).toBe(true);
  });

  it('includes Greek letters', () => {
    const result = getCompletions('\\al', 3);
    expect(result).not.toBeNull();
    expect(result!.options.some(o => o.label === '\\alpha')).toBe(true);
  });

  it('provides snippet completions for plain text', () => {
    const result = getCompletions('fig', 3);
    expect(result).not.toBeNull();
    expect(result!.options.some(o => o.label === 'fig')).toBe(true);
  });

  it('provides environment completions after \\begin{', () => {
    const result = getCompletions('\\begin{fig', 10);
    expect(result).not.toBeNull();
    expect(result!.options.some(o => o.label === 'figure')).toBe(true);
  });

  it('provides environment completions after \\end{', () => {
    const result = getCompletions('\\end{tab', 8);
    expect(result).not.toBeNull();
    expect(result!.options.some(o => o.label === 'tabular')).toBe(true);
  });
});

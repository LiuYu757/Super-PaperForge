import { describe, it, expect } from 'vitest';
import { latexCompletionSource } from '@/lib/latex-completions';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';

function getCompletions(doc: string, pos: number) {
  const state = EditorState.create({ doc });
  const ctx = new CompletionContext(state, pos, false);
  return latexCompletionSource(ctx);
}

describe('BibTeX autocomplete', () => {
  it('provides entry types after @', () => {
    const result = getCompletions('@art', 4);
    expect(result).not.toBeNull();
    expect(result!.options.some(o => o.label === '@article')).toBe(true);
  });

  it('provides @inproceedings', () => {
    const result = getCompletions('@inp', 4);
    expect(result).not.toBeNull();
    expect(result!.options.some(o => o.label === '@inproceedings')).toBe(true);
  });

  it('provides @book', () => {
    const result = getCompletions('@bo', 3);
    expect(result).not.toBeNull();
    expect(result!.options.some(o => o.label === '@book')).toBe(true);
  });

  it('expands @article to full template', () => {
    const result = getCompletions('@', 1);
    expect(result).not.toBeNull();
    const article = result!.options.find(o => o.label === '@article');
    expect(article).toBeDefined();
    expect(typeof article!.apply).toBe('string');
    expect((article!.apply as string)).toContain('author');
    expect((article!.apply as string)).toContain('journal');
  });

  it('has at least 7 entry types', () => {
    const result = getCompletions('@', 1);
    expect(result).not.toBeNull();
    expect(result!.options.length).toBeGreaterThanOrEqual(7);
  });
});

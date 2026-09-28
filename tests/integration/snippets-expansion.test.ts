import { describe, it, expect } from 'vitest';
import { LATEX_SNIPPETS } from '@/lib/latex-snippets';

describe('snippet expansion content', () => {
  it('fig has caption and label', () => {
    const s = LATEX_SNIPPETS.find(x => x.label === 'fig')!;
    expect(s.apply).toContain('\\caption');
    expect(s.apply).toContain('\\label');
  });
  it('tab has hline', () => {
    const s = LATEX_SNIPPETS.find(x => x.label === 'tab')!;
    expect(s.apply).toContain('\\hline');
  });
  it('doc has maketitle', () => {
    const s = LATEX_SNIPPETS.find(x => x.label === 'doc')!;
    expect(s.apply).toContain('\\maketitle');
  });
  it('enum has 3 items', () => {
    const s = LATEX_SNIPPETS.find(x => x.label === 'enum')!;
    expect((s.apply as string).match(/\\item/g)!.length).toBe(3);
  });
});

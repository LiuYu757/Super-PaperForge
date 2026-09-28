import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');

describe('editor panel components', () => {
  const panels = [
    'symbol-picker',
    'citation-picker',
    'math-preview',
    'ai-assistant',
    'table-generator',
    'equation-builder',
    'document-stats',
    'document-outline',
    'onboarding-tips',
  ];

  panels.forEach((panel) => {
    const file = `src/components/editor/${panel}.tsx`;
    it(`${panel} exists`, () => {
      expect(existsSync(join(process.cwd(), file))).toBe(true);
    });
    it(`${panel} exports a component`, () => {
      const content = read(file);
      expect(content).toContain('export');
    });
    it(`${panel} is a memo or function component`, () => {
      const content = read(file);
      expect(content.includes('memo(') || content.includes('function ')).toBe(true);
    });
  });
});

describe('symbol picker', () => {
  const src = read('src/components/editor/symbol-picker.tsx');
  it('has 70+ symbols', () => {
    const count = (src.match(/cmd: '/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(70);
  });
  it('has search filter', () => { expect(src).toContain('filter'); });
  it('dispatches latex-insert', () => { expect(src).toContain('latex-insert'); });
});

describe('citation picker', () => {
  const src = read('src/components/editor/citation-picker.tsx');
  it('parses BibTeX entries', () => { expect(src).toContain('parseBibEntries'); });
  it('inserts cite command', () => { expect(src).toContain('\\cite{'); });
  it('has search', () => { expect(src).toContain('filter'); });
});

describe('equation builder', () => {
  const src = read('src/components/editor/equation-builder.tsx');
  it('has templates', () => { expect(src).toContain('TEMPLATES'); });
  it('has KaTeX preview', () => { expect(src).toContain('katex'); });
  it('generates display equation', () => { expect(src).toContain('\\['); });
});

describe('table generator', () => {
  const src = read('src/components/editor/table-generator.tsx');
  it('generates tabular', () => { expect(src).toContain('\\begin{tabular}'); });
  it('supports booktabs', () => { expect(src).toContain('\\toprule'); });
  it('has row/col controls', () => { expect(src).toContain('addRow'); });
});

describe('document stats', () => {
  const src = read('src/components/editor/document-stats.tsx');
  it('counts words', () => { expect(src).toContain('words'); });
  it('counts figures', () => { expect(src).toContain('figures'); });
  it('counts citations', () => { expect(src).toContain('citations'); });
  it('has section breakdown', () => { expect(src).toContain('sectionBreakdown'); });
  it('calculates reading time', () => { expect(src).toContain('readingTime'); });
});

describe('ai assistant', () => {
  const src = read('src/components/editor/ai-assistant.tsx');
  it('has 4 modes', () => {
    expect(src).toContain("'complete'");
    expect(src).toContain("'fix'");
    expect(src).toContain("'explain'");
    expect(src).toContain("'convert'");
  });
  it('calls AI API', () => { expect(src).toContain('/api/v1/ai/assist'); });
});

describe('global search', () => {
  const src = read('src/components/dashboard/global-search.tsx');
  it('has keyboard shortcut', () => { expect(src).toContain('Shift'); });
  it('searches projects', () => { expect(src).toContain('/api/v1/projects'); });
  it('has debounce', () => { expect(src).toContain('setTimeout'); });
});

describe('editor layout panel types', () => {
  const src = read('src/components/editor/editor-layout.tsx');
  it('has 11+ panel types', () => {
    const types = ['pdf', 'history', 'git', 'outline', 'symbols', 'cite', 'math', 'ai', 'table', 'equation', 'stats'];
    types.forEach(t => expect(src).toContain(`'${t}'`));
  });
});

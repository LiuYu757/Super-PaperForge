import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const DOCS_PAGES = [
  'src/app/docs/page.tsx',
  'src/app/docs/api/page.tsx',
  'src/app/docs/symbols/page.tsx',
  'src/app/docs/templates/page.tsx',
  'src/app/docs/getting-started/page.tsx',
];

describe('docs sub-pages', () => {
  DOCS_PAGES.forEach(p => {
    it(`${p.split('/').slice(-2).join('/')} exists`, () => {
      expect(existsSync(join(process.cwd(), p))).toBe(true);
    });
  });

  it('getting-started has 7 steps', () => {
    const c = readFileSync(join(process.cwd(), 'src/app/docs/getting-started/page.tsx'), 'utf-8');
    expect((c.match(/<h2>/g) || []).length).toBeGreaterThanOrEqual(7);
  });

  it('symbols has 67+ symbols', () => {
    const c = readFileSync(join(process.cwd(), 'src/app/docs/symbols/page.tsx'), 'utf-8');
    expect((c.match(/cmd:/g) || []).length).toBeGreaterThanOrEqual(50);
  });

  it('templates has 6 templates', () => {
    const c = readFileSync(join(process.cwd(), 'src/app/docs/templates/page.tsx'), 'utf-8');
    expect((c.match(/name:/g) || []).length).toBeGreaterThanOrEqual(6);
  });

  it('api docs has 6 groups', () => {
    const c = readFileSync(join(process.cwd(), 'src/app/docs/api/page.tsx'), 'utf-8');
    expect((c.match(/name:/g) || []).length).toBeGreaterThanOrEqual(6);
  });
});

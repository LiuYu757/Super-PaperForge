import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('accessibility', () => {
  it('layout has skip-to-content link', () => {
    expect(readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf-8')).toContain('main-content');
  });
  it('layout has lang=en', () => {
    expect(readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf-8')).toContain('lang="en"');
  });
  it('editor has aria-label', () => {
    expect(readFileSync(join(process.cwd(), 'src/components/editor/latex-editor.tsx'), 'utf-8')).toContain('aria-label');
  });
});

describe('SEO', () => {
  it('layout has metadataBase', () => {
    expect(readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf-8')).toContain('metadataBase');
  });
  it('layout has OG metadata', () => {
    expect(readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf-8')).toContain('openGraph');
  });
  it('layout has twitter card', () => {
    expect(readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf-8')).toContain('twitter');
  });
  it('layout has keywords', () => {
    expect(readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf-8')).toContain('keywords');
  });
  it('opengraph-image exists', () => {
    expect(existsSync(join(process.cwd(), 'src/app/opengraph-image.tsx'))).toBe(true);
  });
  it('manifest.json exists', () => {
    expect(existsSync(join(process.cwd(), 'public/manifest.json'))).toBe(true);
  });
  it('robots.txt exists', () => {
    expect(existsSync(join(process.cwd(), 'public/robots.txt'))).toBe(true);
  });
  it('sitemap has 13 urls', () => {
    const c = readFileSync(join(process.cwd(), 'src/app/sitemap.ts'), 'utf-8');
    expect((c.match(/url:/g) || []).length).toBe(13);
  });
});

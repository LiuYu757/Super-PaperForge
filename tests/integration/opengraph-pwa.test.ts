import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('OG image', () => {
  const og = readFileSync(join(process.cwd(), 'src/app/opengraph-image.tsx'), 'utf-8');
  it('has edge runtime', () => { expect(og).toContain("runtime = 'edge'"); });
  it('has 1200x630 size', () => { expect(og).toContain('1200'); expect(og).toContain('630'); });
  it('has PaperForge branding', () => { expect(og).toContain('PaperForge'); });
  it('has feature pills', () => { expect(og).toContain('Real-time'); });
  it('has GitHub URL', () => { expect(og).toContain('github.com'); });
});

describe('PWA manifest', () => {
  const m = JSON.parse(readFileSync(join(process.cwd(), 'public/manifest.json'), 'utf-8'));
  it('name is PaperForge', () => { expect(m.name).toBe('PaperForge'); });
  it('has orange theme', () => { expect(m.theme_color).toBe('#f97316'); });
  it('standalone display', () => { expect(m.display).toBe('standalone'); });
  it('has icons', () => { expect(m.icons.length).toBeGreaterThan(0); });
  it('has categories', () => { expect(m.categories).toContain('productivity'); });
});

describe('robots.txt', () => {
  const r = readFileSync(join(process.cwd(), 'public/robots.txt'), 'utf-8');
  it('allows root', () => { expect(r).toContain('Allow: /'); });
  it('blocks API', () => { expect(r).toContain('Disallow: /api/'); });
  it('blocks admin', () => { expect(r).toContain('Disallow: /admin/'); });
  it('has sitemap', () => { expect(r).toContain('Sitemap:'); });
});

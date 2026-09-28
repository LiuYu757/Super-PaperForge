import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('build configuration', () => {
  it('next.config.mjs has security headers', () => {
    const c = readFileSync(join(process.cwd(), 'next.config.mjs'), 'utf-8');
    expect(c).toContain('X-Content-Type-Options');
    expect(c).toContain('X-Frame-Options');
    expect(c).toContain('Strict-Transport-Security');
    expect(c).toContain('Referrer-Policy');
  });
  it('next.config.mjs has image optimization', () => {
    const c = readFileSync(join(process.cwd(), 'next.config.mjs'), 'utf-8');
    expect(c).toContain('images');
    expect(c).toContain('optimizePackageImports');
  });
  it('tsconfig excludes seed files', () => {
    const c = readFileSync(join(process.cwd(), 'tsconfig.json'), 'utf-8');
    expect(c).toContain('prisma/seed.ts');
    expect(c).toContain('prisma/seed-demo.ts');
  });
  it('.dockerignore exists', () => {
    expect(existsSync(join(process.cwd(), '.dockerignore'))).toBe(true);
  });
  it('.editorconfig exists', () => {
    expect(existsSync(join(process.cwd(), '.editorconfig'))).toBe(true);
  });
  it('.nvmrc pins node 20', () => {
    const c = readFileSync(join(process.cwd(), '.nvmrc'), 'utf-8').trim();
    expect(c).toBe('20');
  });
  it('package.json has all scripts', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
    expect(pkg.scripts).toHaveProperty('dev');
    expect(pkg.scripts).toHaveProperty('build');
    expect(pkg.scripts).toHaveProperty('test');
    expect(pkg.scripts).toHaveProperty('lint');
    expect(pkg.scripts).toHaveProperty('db:seed');
    expect(pkg.scripts).toHaveProperty('db:seed-demo');
  });
  it('manifest.json has correct theme', () => {
    const m = JSON.parse(readFileSync(join(process.cwd(), 'public/manifest.json'), 'utf-8'));
    expect(m.name).toBe('PaperForge');
    expect(m.theme_color).toBe('#f97316');
  });
});

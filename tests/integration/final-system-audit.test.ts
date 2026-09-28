import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

function countFiles(dir: string, ext?: string): number {
  let n = 0;
  try {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) n += countFiles(p, ext);
      else if (!ext || e.endsWith(ext)) n++;
    }
  } catch {}
  return n;
}

describe('project scale', () => {
  it('150+ source TS/TSX files', () => { expect(countFiles(join(process.cwd(), 'src'), '.tsx') + countFiles(join(process.cwd(), 'src'), '.ts')).toBeGreaterThan(150); });
  it('50+ test files', () => { expect(countFiles(join(process.cwd(), 'tests'), '.ts')).toBeGreaterThan(50); });
  it('25+ API route files', () => { expect(countFiles(join(process.cwd(), 'src/app/api'), '.ts')).toBeGreaterThan(25); });
  it('14+ editor components', () => { expect(countFiles(join(process.cwd(), 'src/components/editor'), '.tsx')).toBeGreaterThanOrEqual(14); });
  it('15+ lib utilities', () => { expect(countFiles(join(process.cwd(), 'src/lib'), '.ts')).toBeGreaterThan(15); });
  it('11+ services', () => { expect(countFiles(join(process.cwd(), 'src/services'), '.ts')).toBeGreaterThanOrEqual(11); });
});

describe('documentation completeness', () => {
  ['README.md','CONTRIBUTING.md','SECURITY.md','CHANGELOG.md','LICENSE','.env.example'].forEach(f => {
    it(f, () => { expect(existsSync(join(process.cwd(), f))).toBe(true); });
  });
});

describe('deployment readiness', () => {
  it('Dockerfile', () => { expect(existsSync(join(process.cwd(), 'Dockerfile'))).toBe(true); });
  it('.dockerignore', () => { expect(existsSync(join(process.cwd(), '.dockerignore'))).toBe(true); });
  it('docker-compose.yml', () => { expect(existsSync(join(process.cwd(), 'docker-compose.yml'))).toBe(true); });
  it('nginx.conf', () => { expect(existsSync(join(process.cwd(), 'nginx/nginx.conf'))).toBe(true); });
  it('CI workflow', () => { expect(existsSync(join(process.cwd(), '.github/workflows/ci.yml'))).toBe(true); });
  it('Dependabot', () => { expect(existsSync(join(process.cwd(), '.github/dependabot.yml'))).toBe(true); });
  it('manifest.json', () => { expect(existsSync(join(process.cwd(), 'public/manifest.json'))).toBe(true); });
  it('robots.txt', () => { expect(existsSync(join(process.cwd(), 'public/robots.txt'))).toBe(true); });
});

describe('version consistency', () => {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
  it('version is semver', () => { expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/); });
  it('name is super-paperforge', () => { expect(pkg.name).toBe('super-paperforge'); });
  it('has all required scripts', () => {
    ['dev','build','start','lint','test','db:seed','db:seed-demo','postinstall'].forEach(s => {
      expect(pkg.scripts).toHaveProperty(s);
    });
  });
});

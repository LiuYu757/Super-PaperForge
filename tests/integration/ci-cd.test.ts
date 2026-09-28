import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('CI/CD & GitHub config', () => {
  it('CI workflow has lint job', () => {
    const c = readFileSync(join(process.cwd(), '.github/workflows/ci.yml'), 'utf-8');
    expect(c).toContain('npm run lint');
  });
  it('CI workflow has test job', () => {
    const c = readFileSync(join(process.cwd(), '.github/workflows/ci.yml'), 'utf-8');
    expect(c).toContain('npm test');
  });
  it('CI workflow has build job', () => {
    const c = readFileSync(join(process.cwd(), '.github/workflows/ci.yml'), 'utf-8');
    expect(c).toContain('npm run build');
  });
  it('CI workflow validates Prisma schemas for every package with one', () => {
    const c = readFileSync(join(process.cwd(), '.github/workflows/ci.yml'), 'utf-8');
    const validateCount = (c.match(/npx prisma validate/g) ?? []).length;
    // root + worker + websocket all carry their own prisma/schema.prisma
    expect(validateCount).toBeGreaterThanOrEqual(3);
    expect(c).toContain('working-directory: worker');
    expect(c).toContain('working-directory: websocket');
  });
  it('CI workflow builds runtime packages', () => {
    const c = readFileSync(join(process.cwd(), '.github/workflows/ci.yml'), 'utf-8');
    expect(c).toContain('working-directory: worker');
    expect(c).toContain('working-directory: websocket');
  });
  it('runtime Prisma schemas use the current generated client', () => {
    const schemaPaths = [
      'prisma/schema.prisma',
      'worker/prisma/schema.prisma',
      'websocket/prisma/schema.prisma',
    ];
    for (const schemaPath of schemaPaths) {
      const schema = readFileSync(join(process.cwd(), schemaPath), 'utf-8');
      expect(schema).toMatch(/provider\s*=\s*"prisma-client"/);
    }
  });
  it('runtime package builds generate Prisma clients before TypeScript', () => {
    const workerPackage = readFileSync(join(process.cwd(), 'worker/package.json'), 'utf-8');
    const websocketPackage = readFileSync(join(process.cwd(), 'websocket/package.json'), 'utf-8');
    expect(workerPackage).toContain('"build": "prisma generate && tsc"');
    expect(websocketPackage).toContain('"build": "prisma generate && tsc"');
  });
  it('CI workflow path references exist', () => {
    const c = readFileSync(join(process.cwd(), '.github/workflows/ci.yml'), 'utf-8');
    const pathRefs = [
      ...Array.from(c.matchAll(/working-directory:\s*([^\s]+)/g), (m) => m[1]),
      ...Array.from(c.matchAll(/cache-dependency-path:\s*([^\s]+)/g), (m) => m[1]),
    ];
    const missing = pathRefs.filter((ref) => !existsSync(join(process.cwd(), ref)));
    expect(missing, `CI workflow references missing paths: ${missing.join(', ')}`).toEqual([]);
  });
  it('runtime packages stay on the same Prisma major/minor as the app', () => {
    const app = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
    const worker = JSON.parse(readFileSync(join(process.cwd(), 'worker/package.json'), 'utf-8'));
    const websocket = JSON.parse(readFileSync(join(process.cwd(), 'websocket/package.json'), 'utf-8'));
    for (const pkg of [worker, websocket]) {
      expect(pkg.dependencies['@prisma/client']).toBe(app.dependencies['@prisma/client']);
      expect(pkg.devDependencies.prisma).toBe(app.devDependencies.prisma);
      expect(pkg.dependencies['@prisma/adapter-pg']).toBe(app.dependencies['@prisma/adapter-pg']);
    }
  });
  it('Dependabot configured for npm', () => {
    const c = readFileSync(join(process.cwd(), '.github/dependabot.yml'), 'utf-8');
    expect(c).toContain('npm');
  });
  it('Bug report template exists', () => {
    expect(existsSync(join(process.cwd(), '.github/ISSUE_TEMPLATE/bug_report.yml'))).toBe(true);
  });
  it('Feature request template exists', () => {
    expect(existsSync(join(process.cwd(), '.github/ISSUE_TEMPLATE/feature_request.yml'))).toBe(true);
  });
  it('PR template exists', () => {
    expect(existsSync(join(process.cwd(), '.github/pull_request_template.md'))).toBe(true);
  });
  it('SECURITY.md exists', () => {
    expect(existsSync(join(process.cwd(), 'SECURITY.md'))).toBe(true);
  });
  it('CONTRIBUTING.md exists', () => {
    expect(existsSync(join(process.cwd(), 'CONTRIBUTING.md'))).toBe(true);
  });
  it('CHANGELOG.md exists', () => {
    expect(existsSync(join(process.cwd(), 'CHANGELOG.md'))).toBe(true);
  });
});

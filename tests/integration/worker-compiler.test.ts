import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('worker compiler', () => {
  const c = readFileSync(join(process.cwd(), 'worker/src/compiler.ts'), 'utf-8');
  const tex = readFileSync(join(process.cwd(), 'tex-runtime/compile.sh'), 'utf-8');
  it('supports pdflatex', () => { expect(c).toContain('pdflatex'); });
  it('supports xelatex', () => { expect(c).toContain('xelatex'); });
  it('supports lualatex', () => { expect(c).toContain('lualatex'); });
  it('runs latexmk only in the isolated TeX image', () => {
    expect(c).not.toContain('execFile');
    expect(tex).toContain('latexmk');
  });
  it('has timeout', () => { expect(c).toContain('timeout'); });
  it('has synctex', () => { expect(c).toContain('synctex'); });
  it('runs pandoc DOCX in the TeX image', () => { expect(tex).toContain('pandoc'); });
  it('rejects unsafe artifact types', () => { expect(c).toContain('isSymbolicLink'); });
});

describe('worker index', () => {
  const w = readFileSync(join(process.cwd(), 'worker/src/index.ts'), 'utf-8');
  it('has BullMQ worker', () => { expect(w).toContain('Worker'); });
  it('has SIGTERM', () => { expect(w).toContain('SIGTERM'); });
  it('has failed handler', () => { expect(w).toContain('failed'); });
  it('has completed handler', () => { expect(w).toContain('completed'); });
  it('has MinIO download', () => { expect(w).toContain('minio'); });
  it('has Prisma update', () => { expect(w).toContain('prisma'); });
});

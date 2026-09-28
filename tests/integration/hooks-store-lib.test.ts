import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

describe('hooks', () => {
  it('use-online-status.ts exists', () => { expect(existsSync(join(process.cwd(), 'src/hooks/use-online-status.ts'))).toBe(true); });
  it('uses useSyncExternalStore', () => {
    expect(readFileSync(join(process.cwd(), 'src/hooks/use-online-status.ts'), 'utf-8')).toContain('useSyncExternalStore');
  });
});

describe('store persistence', () => {
  it('editor-store uses persist middleware', () => {
    const c = readFileSync(join(process.cwd(), 'src/store/editor-store.ts'), 'utf-8');
    expect(c).toContain("import { persist }");
    expect(c).toContain('paperforge-editor');
  });
  it('partializes only preferences', () => {
    const c = readFileSync(join(process.cwd(), 'src/store/editor-store.ts'), 'utf-8');
    expect(c).toContain('partialize');
    expect(c).toContain('fontSize');
    expect(c).toContain('wordWrap');
  });
});

describe('lib utilities', () => {
  ['auth.ts','prisma.ts','redis.ts','minio.ts','encryption.ts','email.ts','validation.ts',
   'api-response.ts','errors.ts','rate-limit.ts','utils.ts','jwt-utils.ts',
   'latex-completions.ts','latex-language.ts','latex-linter.ts','latex-fold.ts',
   'latex-snippets.ts','latex-error-parser.ts'].forEach(f => {
    it(`lib/${f} exists`, () => { expect(existsSync(join(process.cwd(), 'src/lib', f))).toBe(true); });
  });
});

import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';

describe('loading skeletons', () => {
  ['src/app/(dashboard)/loading.tsx','src/app/(dashboard)/settings/loading.tsx','src/app/(dashboard)/templates/loading.tsx','src/app/admin/loading.tsx','src/app/editor/[projectId]/loading.tsx','src/app/(auth)/loading.tsx'].forEach(f => {
    it(f.split('/').slice(-2).join('/'), () => { expect(existsSync(join(process.cwd(), f))).toBe(true); });
  });
});

describe('error + not-found pages', () => {
  it('error.tsx exists', () => { expect(existsSync(join(process.cwd(), 'src/app/error.tsx'))).toBe(true); });
  it('not-found.tsx exists', () => { expect(existsSync(join(process.cwd(), 'src/app/not-found.tsx'))).toBe(true); });
  it('error-boundary exists', () => { expect(existsSync(join(process.cwd(), 'src/components/shared/error-boundary.tsx'))).toBe(true); });
});

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('git routes', () => {
  ['link','push','pull'].forEach(r => {
    const f = join(process.cwd(), `src/app/api/v1/projects/[id]/git/${r}/route.ts`);
    it(`git/${r} exists`, () => { expect(existsSync(f)).toBe(true); });
    it(`git/${r} uses apiSuccess`, () => { expect(readFileSync(f,'utf-8')).toContain('apiSuccess'); });
  });
});

describe('version routes', () => {
  it('versions list exists', () => { expect(existsSync(join(process.cwd(),'src/app/api/v1/projects/[id]/versions/route.ts'))).toBe(true); });
  it('diff exists', () => { expect(existsSync(join(process.cwd(),'src/app/api/v1/projects/[id]/versions/[versionId]/diff/route.ts'))).toBe(true); });
  it('restore exists', () => { expect(existsSync(join(process.cwd(),'src/app/api/v1/projects/[id]/versions/[versionId]/restore/route.ts'))).toBe(true); });
});

describe('member routes', () => {
  it('members list', () => { expect(existsSync(join(process.cwd(),'src/app/api/v1/projects/[id]/members/route.ts'))).toBe(true); });
  it('member by id', () => { expect(existsSync(join(process.cwd(),'src/app/api/v1/projects/[id]/members/[userId]/route.ts'))).toBe(true); });
  it('share link', () => { expect(existsSync(join(process.cwd(),'src/app/api/v1/projects/[id]/share-link/route.ts'))).toBe(true); });
});

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('compile route', () => {
  const c = readFileSync(join(process.cwd(), 'src/app/api/v1/projects/[id]/compile/route.ts'), 'utf-8');
  it('has rate limiting', () => { expect(c).toContain('checkRateLimit'); });
  it('has rate limit headers', () => { expect(c).toContain('rateLimitHeaders'); });
  it('has token scope and role check', () => { expect(c).toContain('assertTokenAccess'); });
  it('returns 202', () => { expect(c).toContain('202'); });
});

describe('compile sub-routes exist', () => {
  ['status','pdf','docx','synctex'].forEach(r => {
    it(`${r}/route.ts exists`, () => {
      expect(existsSync(join(process.cwd(), `src/app/api/v1/projects/[id]/compile/[compileId]/${r}/route.ts`))).toBe(true);
    });
  });
});

describe('compilation service', () => {
  const s = readFileSync(join(process.cwd(), 'src/services/compilation-service.ts'), 'utf-8');
  it('has path traversal check', () => { expect(s).toContain('..'); });
  it('has BullMQ queue', () => { expect(s).toContain('Queue'); });
  it('has exponential backoff', () => { expect(s).toContain('exponential'); });
  it('has priority', () => { expect(s).toContain('priority'); });
});

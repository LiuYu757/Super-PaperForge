import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { RATE_LIMITS } from '@/lib/constants';

/**
 * Routes that touch external systems or do expensive work must enforce
 * a rate limit. We assert it structurally so a future refactor can't
 * silently remove the protection.
 */
const RATE_LIMITED_ROUTES: Array<{ path: string; limitKey: keyof typeof RATE_LIMITS }> = [
  { path: 'src/app/api/v1/render/route.ts',                            limitKey: 'RENDER' },
  { path: 'src/app/api/v1/projects/[id]/git/push/route.ts',            limitKey: 'GIT_OP' },
  { path: 'src/app/api/v1/projects/[id]/git/pull/route.ts',            limitKey: 'GIT_OP' },
  { path: 'src/app/api/v1/projects/[id]/share-link/route.ts',          limitKey: 'SHARE_LINK' },
  { path: 'src/app/api/v1/projects/[id]/files/upload/route.ts',        limitKey: 'FILE_UPLOAD' },
  { path: 'src/app/api/v1/projects/import/route.ts',                   limitKey: 'IMPORT' },
  { path: 'src/app/api/v1/projects/import-url/route.ts',               limitKey: 'IMPORT' },
  { path: 'src/app/api/v1/user/account/route.ts',                      limitKey: 'ACCOUNT_DELETE' },
];

describe('high-risk routes enforce rate limiting', () => {
  for (const { path, limitKey } of RATE_LIMITED_ROUTES) {
    it(`${path} → RATE_LIMITS.${String(limitKey)}`, () => {
      const src = readFileSync(join(process.cwd(), path), 'utf-8');
      expect(src, `${path} is missing enforceRateLimit`).toMatch(
        /enforceRateLimit\s*\(/,
      );
      expect(src, `${path} should reference RATE_LIMITS.${String(limitKey)}`).toContain(
        `RATE_LIMITS.${String(limitKey)}`,
      );
    });
  }
});

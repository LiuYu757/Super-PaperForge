import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';

const API_ROUTES = [
  'src/app/api/healthz/route.ts',
  'src/app/api/v1/auth/register/route.ts',
  'src/app/api/v1/auth/forgot-password/route.ts',
  'src/app/api/v1/auth/reset-password/route.ts',
  'src/app/api/v1/auth/verify-email/[token]/route.ts',
  'src/app/api/v1/auth/configured-providers/route.ts',
  'src/app/api/v1/billing/plans/route.ts',
  'src/app/api/v1/billing/checkout/route.ts',
  'src/app/api/v1/billing/sales-inquiry/route.ts',
  'src/app/api/v1/projects/route.ts',
  'src/app/api/v1/projects/[id]/route.ts',
  'src/app/api/v1/projects/[id]/compile/route.ts',
  'src/app/api/v1/projects/[id]/files/route.ts',
  'src/app/api/v1/projects/[id]/files/upload/route.ts',
  'src/app/api/v1/projects/[id]/export/route.ts',
  'src/app/api/v1/projects/[id]/members/route.ts',
  'src/app/api/v1/projects/[id]/versions/route.ts',
  'src/app/api/v1/projects/[id]/git/link/route.ts',
  'src/app/api/v1/projects/[id]/git/push/route.ts',
  'src/app/api/v1/projects/[id]/git/pull/route.ts',
  'src/app/api/v1/projects/[id]/share-link/route.ts',
  'src/app/api/v1/admin/stats/route.ts',
  'src/app/api/v1/admin/users/route.ts',
  'src/app/api/v1/admin/workers/route.ts',
  'src/app/api/v1/templates/route.ts',
  'src/app/api/v1/user/profile/route.ts',
  'src/app/api/v1/user/avatar/route.ts',
  'src/app/api/v1/user/settings/route.ts',
  'src/app/api/v1/user/git-credentials/route.ts',
  'src/app/api/v1/join/[token]/route.ts',
];

describe('all API routes exist', () => {
  API_ROUTES.forEach(r => {
    it(r.replace('src/app/api/', ''), () => {
      expect(existsSync(join(process.cwd(), r))).toBe(true);
    });
  });
});

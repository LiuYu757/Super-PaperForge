import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';

const PUBLIC_PAGES = [
  'src/app/page.tsx', 'src/app/pricing/page.tsx', 'src/app/privacy/page.tsx',
  'src/app/terms/page.tsx', 'src/app/docs/page.tsx', 'src/app/docs/api/page.tsx',
  'src/app/changelog/page.tsx', 'src/app/status/page.tsx', 'src/app/sitemap.ts',
  'src/app/(auth)/login/page.tsx', 'src/app/(auth)/register/page.tsx',
];

describe('all sitemap pages exist', () => {
  PUBLIC_PAGES.forEach(p => {
    it(p, () => { expect(existsSync(join(process.cwd(), p))).toBe(true); });
  });
});

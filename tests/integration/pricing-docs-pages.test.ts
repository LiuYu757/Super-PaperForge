import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';

describe('new pages exist on disk', () => {
  const pages = ['src/app/pricing/page.tsx', 'src/app/privacy/page.tsx', 'src/app/terms/page.tsx', 'src/app/docs/page.tsx'];
  pages.forEach(p => {
    it(`${p} exists`, () => {
      expect(existsSync(join(process.cwd(), p))).toBe(true);
    });
  });
});

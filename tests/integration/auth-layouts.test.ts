import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

describe('auth layouts have try/catch protection', () => {
  const files = [
    'src/app/(dashboard)/layout.tsx',
    'src/app/admin/layout.tsx',
    'src/app/editor/[projectId]/page.tsx',
  ];

  files.forEach(f => {
    it(`${f} has try/catch around auth()`, () => {
      const content = readFileSync(join(process.cwd(), f), 'utf-8');
      expect(content).toContain('try');
      expect(content).toContain('catch');
      expect(content).toContain('auth()');
    });
  });
});

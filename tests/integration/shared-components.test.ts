import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';

describe('shared components', () => {
  ['navbar.tsx','command-palette.tsx','error-boundary.tsx'].forEach(f => {
    it(`${f} exists`, () => { expect(existsSync(join(process.cwd(), 'src/components/shared', f))).toBe(true); });
  });
  ['button.tsx','dialog.tsx','input.tsx','badge.tsx','card.tsx','command.tsx'].forEach(f => {
    it(`ui/${f} exists`, () => { expect(existsSync(join(process.cwd(), 'src/components/ui', f))).toBe(true); });
  });
});

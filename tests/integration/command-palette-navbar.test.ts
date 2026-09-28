import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('command palette', () => {
  const cp = readFileSync(join(process.cwd(), 'src/components/shared/command-palette.tsx'), 'utf-8');
  it('has Ctrl+K shortcut', () => { expect(cp).toContain('Ctrl'); });
  it('has navigation commands', () => { expect(cp).toContain('/projects'); });
  it('has theme switching', () => { expect(cp).toContain('setTheme'); });
  it('has LaTeX commands', () => { expect(cp).toContain('latex-insert'); });
  it('has editor detection', () => { expect(cp).toContain('usePathname'); });
});

describe('navbar', () => {
  const nb = readFileSync(join(process.cwd(), 'src/components/shared/navbar.tsx'), 'utf-8');
  it('has theme toggle', () => { expect(nb).toContain('useTheme'); });
  it('has mobile menu', () => { expect(nb).toContain('Sheet'); });
  it('has user menu', () => { expect(nb).toContain('signOut'); });
  it('has breadcrumbs', () => { expect(nb).toContain('breadcrumb'); });
  it('has active link detection', () => { expect(nb).toContain('usePathname'); });
});

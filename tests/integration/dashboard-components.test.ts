import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const DASHBOARD = ['project-card.tsx','create-project-dialog.tsx','share-dialog.tsx','storage-bar.tsx'];
const AUTH = ['login-form.tsx','register-form.tsx','oauth-buttons.tsx'];

describe('dashboard components', () => {
  DASHBOARD.forEach(f => {
    it(`${f} exists`, () => { expect(existsSync(join(process.cwd(), 'src/components/dashboard', f))).toBe(true); });
  });
  it('project-card has compiler badge', () => {
    expect(readFileSync(join(process.cwd(), 'src/components/dashboard/project-card.tsx'), 'utf-8')).toContain('compiler');
  });
});

describe('auth components', () => {
  AUTH.forEach(f => {
    it(`${f} exists`, () => { expect(existsSync(join(process.cwd(), 'src/components/auth', f))).toBe(true); });
  });
  it('login-form has password toggle', () => {
    expect(readFileSync(join(process.cwd(), 'src/components/auth/login-form.tsx'), 'utf-8')).toContain('EyeIcon');
  });
  it('register-form has strength indicator', () => {
    expect(readFileSync(join(process.cwd(), 'src/components/auth/register-form.tsx'), 'utf-8')).toContain('PasswordStrength');
  });
});

describe('admin pages', () => {
  ['page.tsx','users/page.tsx','templates/page.tsx','audit-log/page.tsx','workers/page.tsx'].forEach(f => {
    it(`admin/${f} exists`, () => { expect(existsSync(join(process.cwd(), 'src/app/admin', f))).toBe(true); });
  });
  it('admin page has real-time refresh', () => {
    expect(readFileSync(join(process.cwd(), 'src/app/admin/page.tsx'), 'utf-8')).toContain('refreshInterval');
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const st = readFileSync(join(process.cwd(), 'src/app/(dashboard)/settings/page.tsx'), 'utf-8');

describe('settings page features', () => {
  it('has profile tab', () => { expect(st).toContain('Profile'); });
  it('has security tab', () => { expect(st).toContain('Security'); });
  it('has editor tab', () => { expect(st).toContain('Editor'); });
  it('has notifications tab', () => { expect(st).toContain('Notification'); });
  it('has appearance tab', () => { expect(st).toContain('Appearance'); });
  it('has password change', () => { expect(st).toContain('password'); });
  it('has danger zone', () => { expect(st).toContain('Delete'); });
  it('sends server-side delete confirmation and current password', () => {
    expect(st).toContain('deleteCurrentPassword');
    expect(st).toContain('confirmation: deleteConfirmText');
    expect(st).toContain('currentPassword: deleteCurrentPassword');
  });
  it('has theme selector', () => { expect(st).toContain('setTheme'); });
  it('has font size setting', () => { expect(st).toContain('fontSize'); });
  it('has toast feedback', () => { expect(st).toContain('toast'); });
});

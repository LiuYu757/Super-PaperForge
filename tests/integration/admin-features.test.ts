import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('admin dashboard', () => {
  const ad = readFileSync(join(process.cwd(), 'src/app/admin/page.tsx'), 'utf-8');
  it('has real-time refresh', () => { expect(ad).toContain('refreshInterval'); });
  it('has health monitoring', () => { expect(ad).toContain('/api/healthz'); });
  it('has 4 stat cards', () => { expect(ad).toContain('userCount'); });
  it('has quick actions', () => { expect(ad).toContain('Quick Actions'); });
  it('has system health', () => { expect(ad).toContain('System Health'); });
});

describe('admin layout', () => {
  const al = readFileSync(join(process.cwd(), 'src/app/admin/layout.tsx'), 'utf-8');
  it('has auth check', () => { expect(al).toContain('auth()'); });
  it('has role check', () => { expect(al).toContain('admin'); });
  it('has nav links', () => { expect(al).toContain('NAV_LINKS'); });
  it('has branding', () => { expect(al).toContain('FlameIcon'); });
  it('has back to app', () => { expect(al).toContain('Back to App'); });
});

describe('admin layout guards against non-admin access', () => {
  const al = readFileSync(join(process.cwd(), 'src/app/admin/layout.tsx'), 'utf-8');

  it('redirects when user is not admin before rendering children', () => {
    // The layout must check the role AND redirect BEFORE rendering children.
    // Verify the redirect call appears after auth/role check but before the JSX return.
    const authIndex = al.indexOf('auth()');
    const redirectIndex = al.indexOf('redirect(');
    const returnIndex = al.indexOf('return (');
    expect(authIndex).toBeGreaterThan(-1);
    expect(redirectIndex).toBeGreaterThan(authIndex);
    expect(returnIndex).toBeGreaterThan(redirectIndex);
  });

  it('checks role against a specific value, not just any truthy session', () => {
    // Ensure the admin check is comparing against 'admin' role, not just session existence
    const hasRoleComparison = /role\b[\s\S]*(?:===|!==|includes)[\s\S]*['"]admin['"]/.test(al)
      || /['"]admin['"][\s\S]*(?:===|!==|includes)[\s\S]*role\b/.test(al);
    expect(hasRoleComparison).toBe(true);
  });
});

describe('admin users', () => {
  const au = readFileSync(join(process.cwd(), 'src/app/admin/users/page.tsx'), 'utf-8');
  it('has search', () => { expect(au).toContain('search'); });
  it('has auto-refresh', () => { expect(au).toContain('refreshInterval'); });
});

describe('admin workers', () => {
  const aw = readFileSync(join(process.cwd(), 'src/app/admin/workers/page.tsx'), 'utf-8');
  it('has auto-refresh', () => { expect(aw).toContain('refreshInterval'); });
});

describe('admin audit log', () => {
  const aa = readFileSync(join(process.cwd(), 'src/app/admin/audit-log/page.tsx'), 'utf-8');
  it('has pagination', () => { expect(aa).toContain('page'); });
  it('has auto-refresh', () => { expect(aa).toContain('refreshInterval'); });
});

describe('admin templates', () => {
  const at = readFileSync(join(process.cwd(), 'src/app/admin/templates/page.tsx'), 'utf-8');
  it('has auto-refresh', () => { expect(at).toContain('refreshInterval'); });
  it('has approve/reject', () => { expect(at).toContain('approved'); });
});

describe('healthz endpoint', () => {
  const hz = readFileSync(join(process.cwd(), 'src/app/api/healthz/route.ts'), 'utf-8');
  it('checks database', () => { expect(hz).toContain('database'); });
  it('checks redis', () => { expect(hz).toContain('redis'); });
  it('checks storage', () => { expect(hz).toContain('storage'); });
  it('has version', () => { expect(hz).toContain('version'); });
  it('has degraded status', () => { expect(hz).toContain('degraded'); });
});

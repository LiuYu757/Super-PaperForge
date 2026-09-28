import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('admin stats route', () => {
  const s = readFileSync(join(process.cwd(), 'src/app/api/v1/admin/stats/route.ts'), 'utf-8');
  it('uses apiSuccess', () => { expect(s).toContain('apiSuccess'); });
  it('uses ApiErrors.forbidden', () => { expect(s).toContain('forbidden'); });
  it('counts users', () => { expect(s).toContain('userCount'); });
  it('counts projects', () => { expect(s).toContain('projectCount'); });
  it('counts compilations', () => { expect(s).toContain('compilationCount'); });
  it('sums storage', () => { expect(s).toContain('storageUsedBytes'); });
});

describe('admin users route', () => {
  const u = readFileSync(join(process.cwd(), 'src/app/api/v1/admin/users/route.ts'), 'utf-8');
  it('has search', () => { expect(u).toContain('search'); });
  it('has pagination', () => { expect(u).toContain('skip'); });
  it('uses apiSuccess', () => { expect(u).toContain('apiSuccess'); });
  it('user detail exists', () => { expect(existsSync(join(process.cwd(), 'src/app/api/v1/admin/users/[id]/route.ts'))).toBe(true); });
});

describe('admin user PATCH — session invalidation', () => {
  const patch = readFileSync(join(process.cwd(), 'src/app/api/v1/admin/users/[id]/route.ts'), 'utf-8');

  it('bumps tokenVersion on role change', () => {
    // Role changes (especially admin demotion) must invalidate the target user's
    // JWT within the next periodic-check window so they cannot retain stale
    // elevated privileges.
    const roleCheckIdx = patch.indexOf('if (data.role !== undefined) {');
    expect(roleCheckIdx).toBeGreaterThan(-1);
    const nextBlock = patch.indexOf('if (data.suspend !== undefined)', roleCheckIdx);
    expect(nextBlock).toBeGreaterThan(roleCheckIdx);
    const roleSection = patch.slice(roleCheckIdx, nextBlock);
    expect(roleSection).toContain('tokenVersion');
    expect(roleSection).toContain('increment');
  });

  it('bumps tokenVersion on suspension', () => {
    // Suspension sets lockedUntil but the JWT check does not read lockedUntil.
    // Only tokenVersion invalidation ensures the session is revoked within
    // the 5-minute check window.
    const suspendBlock = patch.slice(patch.indexOf("data.suspend === true") > -1
      ? patch.indexOf("data.suspend === true")
      : patch.indexOf('data.suspend'));
    expect(patch).toContain('tokenVersion');
    // The increment must appear in the suspend (true) branch, not just unsuspend
    const afterSuspendTrue = patch.slice(patch.indexOf('lockedUntil = new Date('));
    expect(afterSuspendTrue).toContain('tokenVersion');
  });

  it('does NOT bump tokenVersion on unsuspend', () => {
    // Unsuspending a user restores access — no need to invalidate an
    // already-inactive session. Only the suspend branch needs the bump.
    const unsuspendIdx = patch.indexOf("auditDetails.action = 'unsuspend'");
    const suspendIdx = patch.indexOf("auditDetails.action = 'suspend'");
    // unsuspend block must appear after suspend block
    expect(unsuspendIdx).toBeGreaterThan(suspendIdx);
    // No tokenVersion in the unsuspend branch (between 'unsuspend' text and next closing brace)
    const unsuspendBranch = patch.slice(
      patch.lastIndexOf('lockedUntil = null', unsuspendIdx),
      unsuspendIdx,
    );
    expect(unsuspendBranch).not.toContain('tokenVersion');
  });
});

describe('admin user PATCH validation', () => {
  const patch = readFileSync(join(process.cwd(), 'src/app/api/v1/admin/users/[id]/route.ts'), 'utf-8');
  it('requires at least one mutable field', () => {
    expect(patch).toContain('.refine(');
    expect(patch).toContain('At least one user field must be provided');
    expect(
      patch
    ).toContain('data.role !== undefined || data.suspend !== undefined || data.plan !== undefined');
  });
});

describe('admin routes rate limiting', () => {
  it('analytics route is rate-limited per admin', () => {
    const a = readFileSync(join(process.cwd(), 'src/app/api/v1/admin/analytics/route.ts'), 'utf-8');
    expect(a).toContain('enforceRateLimit');
    expect(a).toContain('rate:admin-list:');
    expect(a).toContain('ADMIN_LIST');
  });

  it('user list is rate-limited per admin', () => {
    const u = readFileSync(join(process.cwd(), 'src/app/api/v1/admin/users/route.ts'), 'utf-8');
    expect(u).toContain('enforceRateLimit');
    expect(u).toContain('rate:admin-list:');
    expect(u).toContain('ADMIN_LIST');
  });

  it('user PATCH mutations are rate-limited per admin', () => {
    const p = readFileSync(join(process.cwd(), 'src/app/api/v1/admin/users/[id]/route.ts'), 'utf-8');
    expect(p).toContain('enforceRateLimit');
    expect(p).toContain('rate:admin-mutate:');
    expect(p).toContain('ADMIN_MUTATE');
  });

  it('template PATCH mutations share the admin-mutate rate limit bucket', () => {
    const t = readFileSync(join(process.cwd(), 'src/app/api/v1/admin/templates/[id]/route.ts'), 'utf-8');
    expect(t).toContain('enforceRateLimit');
    expect(t).toContain('rate:admin-mutate:');
    expect(t).toContain('ADMIN_MUTATE');
  });

  it('audit-log GET is rate-limited per admin', () => {
    const a = readFileSync(join(process.cwd(), 'src/app/api/v1/admin/audit-log/route.ts'), 'utf-8');
    expect(a).toContain('enforceRateLimit');
    expect(a).toContain('rate:admin-list:');
    expect(a).toContain('ADMIN_LIST');
  });

  it('templates pending GET is rate-limited per admin', () => {
    const t = readFileSync(join(process.cwd(), 'src/app/api/v1/admin/templates/pending/route.ts'), 'utf-8');
    expect(t).toContain('enforceRateLimit');
    expect(t).toContain('rate:admin-list:');
    expect(t).toContain('ADMIN_LIST');
  });

  it('workers GET is rate-limited per admin', () => {
    const w = readFileSync(join(process.cwd(), 'src/app/api/v1/admin/workers/route.ts'), 'utf-8');
    expect(w).toContain('enforceRateLimit');
    expect(w).toContain('rate:admin-list:');
    expect(w).toContain('ADMIN_LIST');
  });

  it('admin stats is rate-limited per admin', () => {
    const s = readFileSync(join(process.cwd(), 'src/app/api/v1/admin/stats/route.ts'), 'utf-8');
    expect(s).toContain('enforceRateLimit');
    expect(s).toContain('rate:admin-list:');
    expect(s).toContain('ADMIN_LIST');
  });

  it('ADMIN_LIST and ADMIN_MUTATE constants are defined', () => {
    const c = readFileSync(join(process.cwd(), 'src/lib/constants.ts'), 'utf-8');
    expect(c).toContain('ADMIN_LIST');
    expect(c).toContain('ADMIN_MUTATE');
  });
});

describe('admin workers route', () => {
  const w = readFileSync(join(process.cwd(), 'src/app/api/v1/admin/workers/route.ts'), 'utf-8');
  it('uses ApiErrors', () => { expect(w).toContain('ApiErrors'); });
  it('checks admin role', () => { expect(w).toContain('admin'); });
});

describe('admin audit-log route', () => {
  const a = readFileSync(join(process.cwd(), 'src/app/api/v1/admin/audit-log/route.ts'), 'utf-8');
  it('uses apiSuccess', () => { expect(a).toContain('apiSuccess'); });
  it('has page param', () => { expect(a).toContain('page'); });
});

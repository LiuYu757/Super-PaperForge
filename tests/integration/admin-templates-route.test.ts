import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('admin templates routes', () => {
  const p = readFileSync(join(process.cwd(), 'src/app/api/v1/admin/templates/pending/route.ts'), 'utf-8');
  it('pending uses ApiErrors', () => { expect(p).toContain('ApiErrors'); });
  it('pending uses apiSuccess', () => { expect(p).toContain('apiSuccess'); });

  it('template [id] route exists', () => {
    expect(existsSync(join(process.cwd(), 'src/app/api/v1/admin/templates/[id]/route.ts'))).toBe(true);
  });

  const t = readFileSync(join(process.cwd(), 'src/app/api/v1/admin/templates/[id]/route.ts'), 'utf-8');
  it('approve/reject uses apiSuccess', () => { expect(t).toContain('apiSuccess'); });
  it('has PATCH method', () => { expect(t).toContain('PATCH'); });
});

describe('admin user detail route', () => {
  const u = readFileSync(join(process.cwd(), 'src/app/api/v1/admin/users/[id]/route.ts'), 'utf-8');
  it('has PATCH', () => { expect(u).toContain('PATCH'); });
  it('uses apiSuccess', () => { expect(u).toContain('apiSuccess'); });
  it('uses ApiErrors', () => { expect(u).toContain('ApiErrors'); });
  it('has role update', () => { expect(u).toContain('role'); });
});

describe('join share link route', () => {
  const j = readFileSync(join(process.cwd(), 'src/app/api/v1/join/[token]/route.ts'), 'utf-8');
  it('uses apiSuccess', () => { expect(j).toContain('apiSuccess'); });
  it('uses ApiErrors', () => { expect(j).toContain('ApiErrors'); });
  it('calls joinViaShareLink', () => { expect(j).toContain('joinViaShareLink'); });

  // CSRF guard: the join action must not be triggerable as a side-effect of
  // a cross-origin GET (e.g. <img src="…/join/TOKEN">). It changed from GET
  // to POST and the user-facing /join/[token] page wraps it with an explicit
  // click. These tests fail if either side regresses.
  it('exports POST and not GET (CSRF guard)', () => {
    expect(j).toMatch(/export\s+async\s+function\s+POST\b/);
    expect(j).not.toMatch(/export\s+async\s+function\s+GET\b/);
  });

  it('has a /join/[token] confirmation page that POSTs', () => {
    const pagePath = join(process.cwd(), 'src/app/join/[token]/page.tsx');
    const page = readFileSync(pagePath, 'utf-8');
    expect(page).toMatch(/method:\s*['"]POST['"]/);
    expect(page).toContain('/api/v1/join/');
  });

  it('share dialog points at the /join page, not the raw API URL', () => {
    const dialog = readFileSync(
      join(process.cwd(), 'src/components/dashboard/share-dialog.tsx'),
      'utf-8',
    );
    expect(dialog).toContain('/join/');
    expect(dialog).not.toContain('/api/v1/join/');
  });

  it('project share-link route supports owner listing', () => {
    const route = readFileSync(
      join(process.cwd(), 'src/app/api/v1/projects/[id]/share-link/route.ts'),
      'utf-8',
    );
    expect(route).toMatch(/export\s+async\s+function\s+GET\b/);
    expect(route).toContain('listShareLinks');
  });

  it('project share-link item route supports revocation', () => {
    const routePath = join(process.cwd(), 'src/app/api/v1/projects/[id]/share-link/[linkId]/route.ts');
    expect(existsSync(routePath)).toBe(true);
    const route = readFileSync(routePath, 'utf-8');
    expect(route).toMatch(/export\s+async\s+function\s+DELETE\b/);
    expect(route).toContain('revokeShareLink');
  });

  it('share dialog can list, copy, and revoke existing share links', () => {
    const dialog = readFileSync(
      join(process.cwd(), 'src/components/dashboard/share-dialog.tsx'),
      'utf-8',
    );
    expect(dialog).toContain('fetchShareLinks');
    expect(dialog).toContain('handleRevokeLink');
    expect(dialog).toContain('Trash2Icon');
  });

  it('docs/api advertises every share-link verb the routes implement', () => {
    const docs = readFileSync(
      join(process.cwd(), 'src/app/docs/api/page.tsx'),
      'utf-8',
    );
    // List, create, revoke — all must be discoverable on the API reference
    // page so external integrators don't reverse-engineer the contract from
    // tracebacks.
    expect(docs).toMatch(/method:\s*'GET'.*share-link'/);
    expect(docs).toMatch(/method:\s*'POST'.*share-link'/);
    expect(docs).toMatch(/method:\s*'DELETE'.*share-link\/:linkId/);
  });
});

describe('file operations route', () => {
  const f = readFileSync(join(process.cwd(), 'src/app/api/v1/projects/[id]/files/[...path]/route.ts'), 'utf-8');
  it('handles read/write/delete', () => { expect(f).toContain('apiSuccess'); });
  it('has content handling', () => { expect(f).toContain('content'); });
  it('has file path param', () => { expect(f).toContain('path'); });
  it('uses apiSuccess', () => { expect(f).toContain('apiSuccess'); });
  it('has role check', () => { expect(f).toContain('assertProjectRole'); });
});

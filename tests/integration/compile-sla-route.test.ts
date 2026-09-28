import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('compile SLA admin route wiring (static)', () => {
  const routePath = join(process.cwd(), 'src/app/api/v1/admin/compile-sla/route.ts');

  it('the route exists', () => {
    expect(existsSync(routePath)).toBe(true);
  });

  const route = readFileSync(routePath, 'utf-8');

  it('is admin-gated', () => {
    expect(route).toContain('auth()');
    expect(route).toContain("userRole !== 'admin'");
    expect(route).toContain('ApiErrors.forbidden');
  });

  it('is rate-limited on the admin-list bucket', () => {
    expect(route).toContain('enforceRateLimit');
    expect(route).toContain('rate:admin-list:');
    expect(route).toContain('ADMIN_LIST');
  });

  it('delegates aggregation to the metrics service', () => {
    expect(route).toContain('getCompileSlaReport');
  });

  it('only exposes a GET handler (read-only metrics)', () => {
    expect(route).toContain('export async function GET');
    expect(route).not.toMatch(/export async function (POST|PATCH|PUT|DELETE)/);
  });
});

describe('compile SLA admin widget wiring (static)', () => {
  const page = readFileSync(join(process.cwd(), 'src/app/admin/workers/page.tsx'), 'utf-8');

  it('the workers page consumes the SLA endpoint', () => {
    expect(page).toContain('/api/v1/admin/compile-sla');
  });

  it('surfaces p95 latency and target compliance', () => {
    expect(page).toContain('p95');
    expect(page).toContain('meetsTarget');
    expect(page).toContain('Compilation SLA');
  });
});

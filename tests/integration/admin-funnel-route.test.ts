import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('admin growth-funnel route wiring (static)', () => {
  const routePath = join(process.cwd(), 'src/app/api/v1/admin/funnel/route.ts');

  it('the route exists', () => {
    expect(existsSync(routePath)).toBe(true);
  });

  const route = readFileSync(routePath, 'utf-8');

  it('is admin-gated and rate-limited, read-only', () => {
    expect(route).toContain('auth()');
    expect(route).toContain("userRole !== 'admin'");
    expect(route).toContain('rate:admin-list:');
    expect(route).toContain('export async function GET');
    expect(route).not.toMatch(/export async function (POST|PATCH|PUT|DELETE)/);
  });

  it('delegates to the funnel service', () => {
    expect(route).toContain('getFunnelReport');
  });
});

describe('admin growth-funnel widget wiring (static)', () => {
  const page = readFileSync(join(process.cwd(), 'src/app/admin/page.tsx'), 'utf-8');

  it('the dashboard consumes the funnel endpoint and renders conversions', () => {
    expect(page).toContain('/api/v1/admin/funnel');
    expect(page).toContain('Growth Funnel');
    expect(page).toContain('Paid conversions');
  });
});

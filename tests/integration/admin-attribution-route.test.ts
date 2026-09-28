import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('admin attribution route wiring (static)', () => {
  const routePath = join(process.cwd(), 'src/app/api/v1/admin/attribution/route.ts');

  it('the route exists', () => {
    expect(existsSync(routePath)).toBe(true);
  });

  const route = readFileSync(routePath, 'utf-8');

  it('is admin-gated, rate-limited, read-only', () => {
    expect(route).toContain('auth()');
    expect(route).toContain("userRole !== 'admin'");
    expect(route).toContain('rate:admin-list:');
    expect(route).toContain('export async function GET');
    expect(route).not.toMatch(/export async function (POST|PATCH|PUT|DELETE)/);
  });

  it('delegates to the attribution service', () => {
    expect(route).toContain('getAttributionReport');
  });
});

describe('admin attribution widget wiring (static)', () => {
  const page = readFileSync(join(process.cwd(), 'src/app/admin/page.tsx'), 'utf-8');

  it('the dashboard consumes the attribution endpoint and renders sources', () => {
    expect(page).toContain('/api/v1/admin/attribution');
    expect(page).toContain('Acquisition Sources');
  });

  it('surfaces the sampled flag so a bounded scan is not mistaken for complete', () => {
    expect(page).toContain('sampled');
  });
});

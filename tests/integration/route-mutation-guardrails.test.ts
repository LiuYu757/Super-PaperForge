import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, Dirent } from 'fs';
import { join } from 'path';

const SOURCE_ROOT = 'src/app/api/v1';

// These routes commit their audit rows inside changeset-service transactions.
// The real DB suite verifies replay does not produce a second audit row.
const AUDIT_EXEMPT_ROUTES = new Set<string>([
  'src/app/api/v1/projects/[id]/changesets/route.ts',
  'src/app/api/v1/projects/[id]/changesets/[cid]/apply/route.ts',
  'src/app/api/v1/projects/[id]/changesets/[cid]/revert/route.ts',
  'src/app/api/v1/projects/[id]/compile/[compileId]/cancel/route.ts',
  'src/app/api/v1/projects/[id]/compile/route.ts',
]);

const AUTH_EXEMPT_MUTATION_ROUTES = new Set([
  'src/app/api/v1/render/route.ts', // public render helper endpoint
  'src/app/api/v1/auth/forgot-password/route.ts', // unauthenticated by design for recovery
  'src/app/api/v1/auth/register/route.ts', // allows bootstrap account creation
  'src/app/api/v1/auth/reset-password/route.ts', // bootstrap without existing session
  'src/app/api/v1/billing/webhook/route.ts', // authenticated by HMAC signature, not a user session
]);

function listRouteFiles(dir: string): string[] {
  const result: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true }) as Dirent[];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...listRouteFiles(fullPath));
    } else if (entry.isFile() && entry.name === 'route.ts') {
      result.push(fullPath);
    }
  }
  return result;
}

function hasMutationHandler(source: string) {
  return /export async function\s+(POST|PATCH|PUT|DELETE)\s*\(/.test(source);
}

function hasRateLimit(source: string) {
  return /enforceRateLimit|checkRateLimit/.test(source);
}

function hasAudit(source: string) {
  return /logAuditAction|auditLog\.create/.test(source);
}

/**
 * A route authenticates if it calls `auth()` directly, or `authenticateRequest()`
 * — the shared helper for endpoints that serve both the browser and external
 * automation. The helper resolves a Bearer PAT or falls back to `auth()`, and
 * throws 401 on a malformed or revoked token rather than degrading to an
 * anonymous request.
 */
function hasAuth(source: string) {
  return source.includes('auth()') || source.includes('authenticateRequest(');
}

describe('mutation route guardrails', () => {
  const routeFiles = listRouteFiles(SOURCE_ROOT).map((path) => path.replace(/\\/g, '/'));
  const mutationRoutes = routeFiles.filter((path) => hasMutationHandler(readFileSync(path, 'utf-8')));

  for (const routePath of mutationRoutes) {
    it(`rate limits mutation route: ${routePath}`, () => {
      const source = readFileSync(routePath, 'utf-8');
      expect(source, `${routePath} must enforce rate limiting`).toMatch(/enforceRateLimit|checkRateLimit/);
      expect(hasRateLimit(source)).toBe(true);
    });

    if (!AUDIT_EXEMPT_ROUTES.has(routePath)) {
      it(`audits mutation route: ${routePath}`, () => {
        const source = readFileSync(routePath, 'utf-8');
        expect(hasAudit(source), `${routePath} must call logAuditAction or write audit_log`).toBe(true);
      });
    }

    it(`requires auth or explicit exception: ${routePath}`, () => {
      if (AUTH_EXEMPT_MUTATION_ROUTES.has(routePath)) return;
      const source = readFileSync(routePath, 'utf-8');
      expect(
        hasAuth(source),
        `${routePath} must authenticate via auth() or authenticateRequest()`,
      ).toBe(true);
    });
  }

  it('render endpoint does not reference external stylesheets for HTML output', () => {
    const renderRoute = readFileSync(
      'src/app/api/v1/render/route.ts',
      'utf-8',
    );
    expect(renderRoute).not.toContain('cdn.jsdelivr.net');
  });
});

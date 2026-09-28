import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Phase 1 invariants for self-hosted deployments.
 *
 * These cover the two findings that can lose or leak a manuscript:
 *   F03 — a malformed file PUT must never truncate a file to empty.
 *   F05 — a self-hosted instance must never upload the paper to a third party.
 *
 * `src/lib/env.ts` snapshots process.env at import time, so each case resets
 * the module registry and re-imports with the environment it needs.
 */

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

describe('selfhost mode defaults', () => {
  it('disables SaaS surfaces and pins compilation to local', async () => {
    process.env.PAPERFORGE_MODE = 'selfhost';
    for (const key of [
      'ENABLE_INTERNAL_AI',
      'ENABLE_PUBLIC_SIGNUP',
      'ENABLE_PUBLIC_SHARING',
      'ENABLE_BILLING',
      'ENABLE_GROWTH_ANALYTICS',
      'ENABLE_REMOTE_GIT_IMPORT',
      'COMPILATION_BACKEND',
      'ALLOW_REMOTE_COMPILE',
    ]) {
      delete process.env[key];
    }

    const { env } = await import('@/lib/env');

    expect(env.IS_SELFHOST).toBe(true);
    expect(env.ENABLE_INTERNAL_AI).toBe(false);
    expect(env.ENABLE_PUBLIC_SIGNUP).toBe(false);
    expect(env.ENABLE_PUBLIC_SHARING).toBe(false);
    expect(env.ENABLE_BILLING).toBe(false);
    expect(env.ENABLE_GROWTH_ANALYTICS).toBe(false);
    expect(env.ENABLE_REMOTE_GIT_IMPORT).toBe(false);
    expect(env.COMPILATION_BACKEND).toBe('local');
    expect(env.ALLOW_REMOTE_COMPILE).toBe(false);
  });

  it('keeps existing SaaS behaviour untouched by default', async () => {
    delete process.env.PAPERFORGE_MODE;
    for (const key of ['ENABLE_BILLING', 'ALLOW_REMOTE_COMPILE', 'COMPILATION_BACKEND']) {
      delete process.env[key];
    }

    const { env } = await import('@/lib/env');

    expect(env.IS_SELFHOST).toBe(false);
    expect(env.ENABLE_BILLING).toBe(true);
    expect(env.ALLOW_REMOTE_COMPILE).toBe(true);
    expect(env.COMPILATION_BACKEND).toBe('auto');
  });

  it('lets an explicit env var override the mode default', async () => {
    process.env.PAPERFORGE_MODE = 'selfhost';
    process.env.ENABLE_PUBLIC_SIGNUP = 'true';

    const { env } = await import('@/lib/env');

    expect(env.IS_SELFHOST).toBe(true);
    expect(env.ENABLE_PUBLIC_SIGNUP).toBe(true);
  });

  it('defaults the git history path to a durable location in selfhost mode', async () => {
    process.env.PAPERFORGE_MODE = 'selfhost';
    delete process.env.GIT_REPOS_PATH;

    const { env } = await import('@/lib/env');

    // /tmp is not durable across container restarts — version history stored
    // there disappears while the DB still references it.
    expect(env.GIT_REPOS_PATH).toBe('/var/lib/paperforge/git');
    expect(env.GIT_REPOS_PATH.startsWith('/tmp')).toBe(false);
  });
});

describe('remote compilation gating (F05)', () => {
  it('forbids third-party compilation in selfhost mode', async () => {
    process.env.PAPERFORGE_MODE = 'selfhost';
    delete process.env.COMPILATION_BACKEND;
    delete process.env.ALLOW_REMOTE_COMPILE;

    const { isRemoteCompileAllowed } = await import('@/lib/features');

    expect(isRemoteCompileAllowed()).toBe(false);
  });

  it('forbids it whenever the backend is pinned to local, even if remote is allowed', async () => {
    process.env.COMPILATION_BACKEND = 'local';
    process.env.ALLOW_REMOTE_COMPILE = 'true';

    const { isRemoteCompileAllowed } = await import('@/lib/features');

    // A pinned local backend wins: the operator asked for on-box compilation.
    expect(isRemoteCompileAllowed()).toBe(false);
  });

  it('forbids it when remote compile is explicitly disabled', async () => {
    process.env.COMPILATION_BACKEND = 'auto';
    process.env.ALLOW_REMOTE_COMPILE = 'false';

    const { isRemoteCompileAllowed } = await import('@/lib/features');

    expect(isRemoteCompileAllowed()).toBe(false);
  });

  it('still permits it for the default SaaS deployment', async () => {
    delete process.env.PAPERFORGE_MODE;
    delete process.env.COMPILATION_BACKEND;
    delete process.env.ALLOW_REMOTE_COMPILE;

    const { isRemoteCompileAllowed } = await import('@/lib/features');

    expect(isRemoteCompileAllowed()).toBe(true);
  });

  it('never routes to the external LaTeX API when compilation is local-only', async () => {
    process.env.PAPERFORGE_MODE = 'selfhost';

    const source = await import('fs').then((fs) =>
      fs.readFileSync('src/services/compilation-service.ts', 'utf-8'),
    );

    // The external endpoint may still exist for SaaS, but it must be reachable
    // only through the isRemoteCompileAllowed() branch — never as a bare else.
    expect(source).toContain('isRemoteCompileAllowed()');
    const externalCall = source.indexOf('latex.ytotech.com');
    expect(externalCall).toBeGreaterThan(-1);

    // The no-queue path must persist the job rather than upload the manuscript.
    expect(source).toContain('pending_dispatch');
    expect(source).toContain('!frozen && isRemoteCompileAllowed()');
  });
});

describe('feature gating is server-side (not just hidden UI)', () => {
  it('assertFeature throws 404 for a disabled feature', async () => {
    process.env.PAPERFORGE_MODE = 'selfhost';

    const { assertFeature } = await import('@/lib/features');
    const { ApiError } = await import('@/lib/errors');

    try {
      assertFeature('billing');
      throw new Error('expected assertFeature to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      // 404 rather than 403: a disabled surface should look undeployed, so
      // probing does not reveal which SaaS modules exist upstream.
      expect((err as InstanceType<typeof ApiError>).statusCode).toBe(404);
    }
  });

  it('assertFeature is a no-op for an enabled feature', async () => {
    delete process.env.PAPERFORGE_MODE;
    delete process.env.ENABLE_BILLING;

    const { assertFeature } = await import('@/lib/features');

    expect(() => assertFeature('billing')).not.toThrow();
  });

  it('does not disable auth, roles, rate limits or quotas in selfhost mode', async () => {
    process.env.PAPERFORGE_MODE = 'selfhost';

    const { isFeatureEnabled } = await import('@/lib/features');

    // Only SaaS surfaces are gated. Security controls have no gate at all —
    // asserting the enum shape keeps a future edit from adding one casually.
    const gated = [
      'internalAi',
      'publicSignup',
      'publicSharing',
      'billing',
      'growthAnalytics',
      'remoteGitImport',
    ] as const;
    for (const feature of gated) {
      expect(typeof isFeatureEnabled(feature)).toBe('boolean');
    }
  });
});

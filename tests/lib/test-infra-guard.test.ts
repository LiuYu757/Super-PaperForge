/**
 * PR-A test-target guard (review N01): the destructive helper must verify the
 * connected database's identity ON ITS OWN CONNECTION, immediately before the
 * TRUNCATE — a shell that exports a production DATABASE_URL, or a
 * TEST_DATABASE_URL pointing somewhere unexpected, must make resetDatabase
 * REFUSE rather than "connect and clear".
 *
 * `pg` is mocked so these cases run without any real database (they must be
 * part of the plain unit suite, not the destructive acceptance suite).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import os from 'node:os';

const queryMock = vi.fn();
const connectMock = vi.fn();
const endMock = vi.fn();

vi.mock('pg', () => ({
  default: {
    // Must be a regular function so `new pg.Client(...)` works in the helper.
    Client: vi.fn(function ClientCtor() {
      return {
        connect: connectMock,
        query: queryMock,
        end: endMock,
      };
    }),
  },
}));

// A _test-shaped URL the helper is allowed to use.
process.env.TEST_DATABASE_URL =
  'postgresql://pf_test_role:pw@localhost:5433/paperforge_test';
process.env.RUN_DESTRUCTIVE_TESTS = '1';
// Simulate a shell that ALSO exports a production DATABASE_URL: the helper
// must ignore it entirely (the old `override:false` .env load kept it).
process.env.DATABASE_URL =
  'postgresql://prod_user:pw@prod.example.com:5432/paperforge_prod';

const { resetDatabase, isTestInfraReady, TEST_MARKER_TABLE } = await import(
  '../helpers/test-infra'
);

/** What the fake connection reports for the identity + table queries. */
function identityResponses(opts: {
  db?: string;
  user?: string;
  markerTable?: string | null;
  markerValue?: string;
}) {
  const db = opts.db ?? 'paperforge_test';
  const user = opts.user ?? 'pf_test_role';
  return [
    { rows: [{ db, usr: user }] },                              // current_database/current_user
    { rows: [{ to_regclass: opts.markerTable === undefined ? `public.${TEST_MARKER_TABLE}` : opts.markerTable }] },
    { rows: [{ marker: opts.markerValue ?? 'paperforge-acceptance-test-instance' }] },
    // pg_tables listing (only consumed by the happy path)
    {
      rows: [
        { tablename: 'users' },
        { tablename: '_prisma_migrations' },
        { tablename: TEST_MARKER_TABLE },
      ],
    },
    { rows: [] }, // TRUNCATE result
  ];
}

beforeEach(() => {
  queryMock.mockReset();
  connectMock.mockReset().mockResolvedValue(undefined);
  endMock.mockReset().mockResolvedValue(undefined);
});

describe('resetDatabase target guard (N01)', () => {
  it('TRUNCATEs the verified test instance and preserves the marker table', async () => {
    const responses = identityResponses({});
    queryMock.mockImplementation(async () => responses.shift());
    await resetDatabase();
    const sql = queryMock.mock.calls.map((c) => String(c[0]));
    expect(sql.some((s) => s.startsWith('SELECT tablename FROM pg_tables'))).toBe(true);
    const truncate = sql.find((s) => s.startsWith('TRUNCATE'));
    expect(truncate).toBeDefined();
    expect(truncate).not.toContain(TEST_MARKER_TABLE);
    expect(truncate).not.toContain('_prisma_migrations');
  });

  it('refuses when the connected database is not the TEST_DATABASE_URL one', async () => {
    const responses = identityResponses({ db: 'paperforge_prod' });
    queryMock.mockImplementation(async () => responses.shift());
    await expect(resetDatabase()).rejects.toThrow(/does not match.*paperforge_test/);
    expect(queryMock.mock.calls.some((c) => String(c[0]).startsWith('TRUNCATE'))).toBe(false);
  });

  it('refuses a database whose name is not _test-shaped (name check alone is not enough)', async () => {
    // Someone points TEST_DATABASE_URL at a NON-test database: the URL name
    // matches the connection, but the shape guarantee still refuses.
    vi.resetModules();
    const prev = process.env.TEST_DATABASE_URL;
    process.env.TEST_DATABASE_URL = 'postgresql://pf_test_role:pw@localhost:5433/paperforge';
    try {
      const infra2 = await import('../helpers/test-infra');
      const responses = identityResponses({ db: 'paperforge' });
      queryMock.mockReset();
      queryMock.mockImplementation(async () => responses.shift());
      await expect(infra2.resetDatabase()).rejects.toThrow(/not _test-shaped/);
      expect(queryMock.mock.calls.some((c) => String(c[0]).startsWith('TRUNCATE'))).toBe(false);
    } finally {
      process.env.TEST_DATABASE_URL = prev;
    }
  });

  it('refuses when the connection user is not the dedicated test role', async () => {
    const responses = identityResponses({ user: 'postgres' });
    queryMock.mockImplementation(async () => responses.shift());
    await expect(resetDatabase()).rejects.toThrow(/does not match the.*user/);
    expect(queryMock.mock.calls.some((c) => String(c[0]).startsWith('TRUNCATE'))).toBe(false);
  });

  it('refuses when the marker table is missing (not the acceptance instance)', async () => {
    const responses = identityResponses({ markerTable: null });
    queryMock.mockImplementation(async () => responses.shift());
    await expect(resetDatabase()).rejects.toThrow(/marker table/i);
    expect(queryMock.mock.calls.some((c) => String(c[0]).startsWith('TRUNCATE'))).toBe(false);
  });

  it('refuses when the marker table exists but carries the wrong value', async () => {
    const responses = identityResponses({ markerValue: 'something-else' });
    queryMock.mockImplementation(async () => responses.shift());
    await expect(resetDatabase()).rejects.toThrow(/does not carry/i);
    expect(queryMock.mock.calls.some((c) => String(c[0]).startsWith('TRUNCATE'))).toBe(false);
  });

  it('refuses without the explicit RUN_DESTRUCTIVE_TESTS opt-in', async () => {
    const prev = process.env.RUN_DESTRUCTIVE_TESTS;
    process.env.RUN_DESTRUCTIVE_TESTS = undefined;
    try {
      await expect(resetDatabase()).rejects.toThrow(/RUN_DESTRUCTIVE_TESTS=1/);
      expect(queryMock).not.toHaveBeenCalled();
    } finally {
      process.env.RUN_DESTRUCTIVE_TESTS = prev;
    }
  });
});

describe('isTestInfraReady (N01)', () => {
  it('is not ready when TEST_DATABASE_URL is unset (no DATABASE_URL fallback)', async () => {
    const prev = process.env.TEST_DATABASE_URL;
    const prevCwd = process.cwd();
    vi.resetModules();
    // Move away from the repo root so .env.test cannot re-supply the URL —
    // the helper must then be not-ready WITHOUT ever connecting anywhere,
    // including never touching the prod DATABASE_URL this shell simulated.
    process.chdir(os.tmpdir());
    delete process.env.TEST_DATABASE_URL;
    try {
      const infra2 = await import('../helpers/test-infra');
      const ready = await infra2.isTestInfraReady();
      expect(ready).toBe(false);
      expect(infra2.getNotReadyReason()).toMatch(/TEST_DATABASE_URL is not set/);
      expect(connectMock).not.toHaveBeenCalled();
    } finally {
      process.chdir(prevCwd);
      process.env.TEST_DATABASE_URL = prev;
    }
  });
});

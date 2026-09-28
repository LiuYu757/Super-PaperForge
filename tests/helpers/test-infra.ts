/**
 * Real-database / real-object-store harness for the acceptance suite.
 *
 * SECURITY MODEL (review N01 / PR-A):
 *
 *  1. Destructive tests read **only** `TEST_DATABASE_URL` (from the environment
 *     or `.env.test`). They NEVER fall back to `DATABASE_URL` — a shell that
 *     exports a production `DATABASE_URL` cannot make these helpers connect to
 *     it, let alone truncate it.
 *  2. When a test target is configured, this module also *overrides*
 *     `process.env.DATABASE_URL` with the test URL before any code under test
 *     is imported (this file must stay the FIRST import of every test that
 *     reaches the database). The application's Prisma singleton therefore
 *     cannot silently point at a different database than the helpers.
 *  3. `resetDatabase()` re-verifies the target identity **inside the helper**,
 *     on its own connection, immediately before issuing TRUNCATE. Callers
 *     cannot accidentally or maliciously bypass the check:
 *       - `current_database()` must equal the database name in
 *         `TEST_DATABASE_URL` AND the name must end in `_test`/start with
 *         `test` (both, because a name check alone is not sufficient);
 *       - `current_user()` must equal the user in `TEST_DATABASE_URL`
 *         (a dedicated test role cannot hold production rights);
 *       - the `paperforge_test_marker` table must exist and contain the
 *         acceptance marker row (created by `./scripts/test-env.sh migrate`).
 *  4. Destructive runs additionally require `RUN_DESTRUCTIVE_TESTS=1`.
 *  5. The acceptance suite FAILS (never silently skips) when its dependencies
 *     are missing; the plain `npm test` unit suite excludes this directory
 *     entirely and never loads this module.
 *
 * Import order matters: this module loads `.env.test` and pins
 * `process.env.DATABASE_URL` as a side effect, so it must be the FIRST import
 * in any test file that reaches the database.
 */
import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { Client as MinioClient } from 'minio';
import pg from 'pg';

loadEnv({
  path: path.resolve(process.cwd(), '.env.test'),
  override: false,
});

/** Marker row value planted by ./scripts/test-env.sh migrate. */
export const TEST_MARKER_TABLE = 'paperforge_test_marker';
export const TEST_MARKER_VALUE = 'paperforge-acceptance-test-instance';

/**
 * The ONLY connection string these helpers will ever use for destructive
 * operations. No fallback to DATABASE_URL under any circumstance.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? '';
const TEST_MINIO_ENDPOINT = process.env.TEST_MINIO_ENDPOINT ?? '';
const TEST_MINIO_PORT = Number(process.env.TEST_MINIO_PORT ?? 0);
const TEST_MINIO_ACCESS_KEY = process.env.TEST_MINIO_ACCESS_KEY ?? '';
const TEST_MINIO_SECRET_KEY = process.env.TEST_MINIO_SECRET_KEY ?? '';
const TEST_MINIO_BUCKET = process.env.TEST_MINIO_BUCKET ?? '';
const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? '';
if (!TEST_MINIO_ENDPOINT || !Number.isInteger(TEST_MINIO_PORT) || !TEST_MINIO_PORT
  || !TEST_MINIO_ACCESS_KEY || !TEST_MINIO_SECRET_KEY || !TEST_MINIO_BUCKET.endsWith('-test')
  || !TEST_REDIS_URL) {
  throw new Error('Dedicated TEST_MINIO_* and TEST_REDIS_URL are required');
}
if (!['localhost', '127.0.0.1'].includes(TEST_MINIO_ENDPOINT) || TEST_MINIO_PORT !== 9010
  || !['localhost', '127.0.0.1'].includes(new URL(TEST_REDIS_URL).hostname)
  || new URL(TEST_REDIS_URL).port !== '6380') {
  throw new Error('Acceptance test MinIO and Redis must target local isolated ports');
}

/**
 * Pin the application's Prisma client to the test database as well, so the
 * fixtures (which write through @/lib/prisma) and the helpers can never point
 * at two different databases. Only done when a test target is configured.
 */
if (TEST_DATABASE_URL) {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.MINIO_ENDPOINT = TEST_MINIO_ENDPOINT;
  process.env.MINIO_PORT = String(TEST_MINIO_PORT);
  process.env.MINIO_ACCESS_KEY = TEST_MINIO_ACCESS_KEY;
  process.env.MINIO_SECRET_KEY = TEST_MINIO_SECRET_KEY;
  process.env.MINIO_BUCKET = TEST_MINIO_BUCKET;
  process.env.REDIS_URL = TEST_REDIS_URL;
}

const MINIO_ENDPOINT = TEST_MINIO_ENDPOINT;
const MINIO_PORT = TEST_MINIO_PORT;
const MINIO_ACCESS_KEY = TEST_MINIO_ACCESS_KEY;
const MINIO_SECRET_KEY = TEST_MINIO_SECRET_KEY;
export const TEST_BUCKET = TEST_MINIO_BUCKET;

export const minio = new MinioClient({
  endPoint: MINIO_ENDPOINT,
  port: MINIO_PORT,
  useSSL: false,
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY,
});

/** Why the harness is not usable right now (for error messages). */
let notReadyReason = 'not checked yet';

export function getNotReadyReason(): string {
  return notReadyReason;
}

/** Database/user names parsed out of TEST_DATABASE_URL. */
function parseTarget(url: string): { database: string; user: string } {
  const parsed = new URL(url);
  const database = parsed.pathname.replace(/^\//, '');
  const user = decodeURIComponent(parsed.username);
  if (!database || !user) {
    throw new Error('TEST_DATABASE_URL must include a database name and a user');
  }
  return { database, user };
}

/** Must the database pass BOTH the expected-name and a `_test`-shaped check. */
function isTestShapedDatabase(name: string): boolean {
  return name.endsWith('_test') || name.startsWith('test_') || name.startsWith('test-');
}

/**
 * Verify, on the given connection, that we are talking to the dedicated
 * acceptance instance. Throws (never returns false) so callers fail loudly
 * BEFORE any destructive SQL.
 */
async function verifyTestTarget(client: pg.Client): Promise<void> {
  const { database, user } = parseTarget(TEST_DATABASE_URL);

  const ident = await client.query<{ db: string; usr: string }>(
    'SELECT current_database() AS db, current_user AS usr',
  );
  const { db, usr } = ident.rows[0];

  if (db !== database) {
    throw new Error(
      `Refusing destructive test: connected database "${db}" does not match ` +
      `TEST_DATABASE_URL database "${database}"`,
    );
  }
  if (!isTestShapedDatabase(db)) {
    throw new Error(
      `Refusing destructive test: database "${db}" is not _test-shaped ` +
      `(must end in "_test" or start with "test_"/"test-")`,
    );
  }
  if (usr !== user) {
    throw new Error(
      `Refusing destructive test: connected user "${usr}" does not match the ` +
      `TEST_DATABASE_URL user "${user}" (the acceptance role must be a ` +
      'dedicated test account without production privileges)',
    );
  }

  const marker = await client.query<{ to_regclass: string | null }>(
    `SELECT to_regclass('public.${TEST_MARKER_TABLE}') AS to_regclass`,
  );
  if (!marker.rows[0]?.to_regclass) {
    throw new Error(
      `Refusing destructive test: marker table "${TEST_MARKER_TABLE}" is missing. ` +
      'Run ./scripts/test-env.sh migrate to provision the isolated test instance.',
    );
  }
  const row = await client.query<{ marker: string }>(
    `SELECT marker FROM ${TEST_MARKER_TABLE} LIMIT 1`,
  );
  if (row.rows[0]?.marker !== TEST_MARKER_VALUE) {
    throw new Error(
      `Refusing destructive test: marker table "${TEST_MARKER_TABLE}" does not ` +
      `carry the value "${TEST_MARKER_VALUE}" — this is not the acceptance instance`,
    );
  }
}

/** Open a raw connection to the test target, with identity verified. */
async function connectVerified(): Promise<pg.Client> {
  if (!TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is not set (refusing to fall back to DATABASE_URL)');
  }
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    await verifyTestTarget(client);
    return client;
  } catch (err) {
    await client.end();
    throw err;
  }
}

/**
 * Whether the acceptance infra stack is reachable AND passes every identity
 * check. Readiness is checked on every destructive operation again — this is
 * only the probe used to decide whether the suite may start.
 */
export async function isTestInfraReady(): Promise<boolean> {
  if (!TEST_DATABASE_URL) {
    notReadyReason = 'TEST_DATABASE_URL is not set (docker-compose.test.yml stack not configured)';
    return false;
  }
  try {
    const client = await connectVerified();
    await client.end();
    notReadyReason = '';
    return true;
  } catch (err) {
    notReadyReason = err instanceof Error ? err.message : String(err);
    return false;
  }
}

/** Run a raw SQL query against the verified test database. */
export async function pgQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  const client = await connectVerified();
  try {
    return await client.query<T>(sql, params);
  } finally {
    await client.end();
  }
}

/**
 * Remove rows from every public table so each suite starts clean.
 *
 * The identity checks run AGAIN here, on this helper's own connection,
 * immediately before the TRUNCATE — a caller that somehow reaches this
 * function against a non-test database still cannot clear it.
 */
export async function resetDatabase(): Promise<void> {
  if (process.env.RUN_DESTRUCTIVE_TESTS !== '1') {
    throw new Error(
      'resetDatabase() requires RUN_DESTRUCTIVE_TESTS=1 — export it when running ' +
      'the acceptance suite (npm run test:integration).',
    );
  }
  const client = await connectVerified(); // throws before any destructive SQL
  try {
    const { rows } = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    const tables = rows
      .filter((r) => r.tablename !== '_prisma_migrations' && r.tablename !== TEST_MARKER_TABLE)
      .map((r) => r.tablename);
    if (tables.length === 0) return;
    // TRUNCATE ... CASCADE clears referencing tables in one statement, and
    // RESTART IDENTITY keeps fresh UUID defaults working.
    await client.query(
      `TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
  } finally {
    await client.end();
  }
}

/** Read a UTF-8 object from MinIO, or null when missing. */
export async function getTextFromMinio(key: string): Promise<string | null> {
  try {
    const stream = await minio.getObject(TEST_BUCKET, key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf-8');
  } catch {
    return null;
  }
}

/** Write a UTF-8 object to MinIO. */
export async function putTextToMinio(key: string, text: string): Promise<void> {
  const exists = await minio.bucketExists(TEST_BUCKET);
  if (!exists) await minio.makeBucket(TEST_BUCKET);
  await minio.putObject(TEST_BUCKET, key, Buffer.from(text, 'utf-8'));
}

/** SHA-256 of a UTF-8 string, lowercase hex — must match sha256Text(). */
export async function sha256(text: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(Buffer.from(text, 'utf-8')).digest('hex');
}

/** Convenience for tests that need a sync hash. */
export function sha256Sync(text: string): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createHash } = require('node:crypto') as typeof import('node:crypto');
  return createHash('sha256').update(Buffer.from(text, 'utf-8')).digest('hex');
}

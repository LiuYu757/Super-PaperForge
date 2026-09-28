#!/usr/bin/env node
/**
 * PR-1 text-source migration report (review R02).
 *
 * Before PR-1 the object store was the authoritative copy of text files and the
 * DB `content` column was a best-effort mirror. PR-1 flips this: PostgreSQL is
 * the single authority for committed text. This script audits the gap between
 * the two stores for every live text file:
 *
 *   - OK            DB content exists and hashes identically to the object.
 *                   (Already authoritative — nothing to do.)
 *   - MISSING_DB    The row has no `content`; MinIO holds the only copy.
 *                   Run with `--backfill` to import it into PostgreSQL.
 *                   Backfilling is a COPY, not a merge — the DB is empty here,
 *                   so there is nothing to overwrite.
 *   - DIVERGED      DB content and the object diverge. That means a write
 *                   landed on one store and not the other in the old dual-store
 *                   design. Do NOT overwrite either side automatically; the
 *                   operator must reconcile deliberately. The script exits 1.
 *
 * Usage:
 *   node scripts/report-text-source.mjs            # report only
 *   node scripts/report-text-source.mjs --backfill # import MISSING_DB rows
 *
 * Reads DATABASE_URL and MINIO_* from the environment (optionally .env).
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import { Client as MinioClient } from 'minio';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[text-source] DATABASE_URL is required (set it or create .env)');
  process.exit(2);
}

const minio = new MinioClient({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: Number(process.env.MINIO_PORT || 9000),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || '',
  secretKey: process.env.MINIO_SECRET_KEY || '',
});
const bucket = process.env.MINIO_BUCKET || 'paperforge';

const BACKFILL = process.argv.includes('--backfill');

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function readObject(key) {
  try {
    const stream = await minio.getObject(bucket, key);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

const { rows } = await client.query(
  `SELECT id, project_id, path, minio_key, is_binary, content, size_bytes
     FROM files
    WHERE deleted_at IS NULL AND is_binary = false
    ORDER BY path`,
);

const summary = { ok: 0, missingDb: 0, diverged: 0, unrecoverable: 0 };
const problems = [];

for (const row of rows) {
  if (!row.minio_key) {
    if (row.content === null) {
      summary.unrecoverable += 1;
      problems.push({ kind: 'UNRECOVERABLE', path: row.path });
    } else summary.ok += 1;
    continue;
  }
  const buf = await readObject(row.minio_key);
  const now = new Date().toISOString();

  if (buf === null) {
    if (row.content !== null) {
      summary.ok += 1; // DB authoritative, no object — that's fine post-migration
    } else {
      summary.unrecoverable += 1;
      problems.push({ kind: 'UNRECOVERABLE', path: row.path });
    }
    continue;
  }

  const objectHash = sha256(buf);
  if (row.content === null) {
    summary.missingDb += 1;
    problems.push({ kind: 'MISSING_DB', path: row.path });
    if (BACKFILL) {
      await client.query('BEGIN');
      try {
        // Serialize with normal document mutations on the project row and
        // refuse to backfill if another writer supplied content meanwhile.
        const owners = await client.query(
          `SELECT u.id, u.storage_quota_bytes FROM users u
           JOIN project_members pm ON pm.user_id = u.id
           WHERE pm.project_id = $1 AND pm.role = 'owner' FOR UPDATE OF u`,
          [row.project_id],
        );
        await client.query('SELECT id FROM projects WHERE id = $1 FOR UPDATE', [row.project_id]);
        const locked = await client.query('SELECT content FROM files WHERE id = $1 FOR UPDATE', [row.id]);
        if (locked.rows[0]?.content !== null) throw new Error(`Concurrent migration of ${row.path}`);
        await client.query('UPDATE files SET content = $1, size_bytes = $2, updated_at = $3 WHERE id = $4', [
          buf.toString('utf-8'), buf.length, now, row.id,
        ]);
        if (owners.rows[0]) {
          const owner = owners.rows[0];
          const used = await client.query(
            `SELECT COALESCE(SUM(f.size_bytes), 0)::bigint AS bytes FROM files f
             JOIN projects p ON p.id = f.project_id
             JOIN project_members pm ON pm.project_id = p.id AND pm.role = 'owner'
             WHERE pm.user_id = $1 AND f.deleted_at IS NULL AND p.deleted_at IS NULL`,
            [owner.id],
          );
          if (BigInt(used.rows[0].bytes) > BigInt(owner.storage_quota_bytes)) {
            throw new Error(`Backfill would exceed owner quota for ${row.path}`);
          }
          await client.query('UPDATE users SET storage_used_bytes = $1 WHERE id = $2', [used.rows[0].bytes, owner.id]);
        }
        const rev = await client.query('UPDATE projects SET revision = revision + 1 WHERE id = $1 RETURNING revision', [row.project_id]);
        await client.query(
          `INSERT INTO audit_log (id, action, target_type, target_id, details)
           VALUES (gen_random_uuid(), 'text.backfilled', 'project', $1,
                   jsonb_build_object('fileId', $2::text, 'revision', $3::text))`,
          [row.project_id, row.id, rev.rows[0].revision],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    continue;
  }

  const dbHash = sha256(Buffer.from(row.content, 'utf-8'));
  if (dbHash === objectHash) {
    summary.ok += 1;
  } else {
    summary.diverged += 1;
    problems.push({
      kind: 'DIVERGED',
      path: row.path,
      dbSha256: dbHash,
      objectSha256: objectHash,
    });
  }
}

await client.end();

console.log(
  `[text-source] text rows: ${rows.length} | OK: ${summary.ok} | MISSING_DB: ${summary.missingDb}` +
    ` | DIVERGED: ${summary.diverged} | UNRECOVERABLE: ${summary.unrecoverable}`,
);
for (const p of problems) {
  if (p.kind === 'MISSING_DB') {
    console.log(`  MISSING_DB ${p.path}${BACKFILL ? '  → backfilled into PostgreSQL' : '  → run with --backfill'}`);
  } else if (p.kind === 'UNRECOVERABLE') {
    console.log(`  UNRECOVERABLE ${p.path}  → restore bytes manually before compiling`);
  } else {
    console.log(
      `  DIVERGED  ${p.path}\n    db:      ${p.dbSha256}\n    object:  ${p.objectSha256}`,
    );
  }
}

if (BACKFILL && summary.missingDb > 0) {
  console.log(`[text-source] backfilled ${summary.missingDb} rows into PostgreSQL.`);
}

if (summary.diverged > 0 || summary.unrecoverable > 0 || (!BACKFILL && summary.missingDb > 0)) {
  console.error('[text-source] DIVERGED rows need manual reconciliation; the DB is authoritative from now on.');
  process.exit(1);
}
process.exit(0);

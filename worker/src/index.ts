import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { Client as MinioClient } from 'minio';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client/client';
import { compileLatex, cancelCompile, CompilerType } from './compiler';
import { env } from './env';
import { materializeFiles } from './materialize-files';
import * as crypto from 'crypto';
import { Queue } from 'bullmq';

// ---------------------------------------------------------------------------
// Prisma client for the worker process.
// ---------------------------------------------------------------------------
const prisma = new PrismaClient({ adapter: new PrismaPg(env.DATABASE_URL) });

// ---------------------------------------------------------------------------
// Redis connection (maxRetriesPerRequest must be null for BullMQ workers)
// ---------------------------------------------------------------------------
function createRedisConnection() {
  const options = { maxRetriesPerRequest: null };
  if (env.REDIS_URL) {
    return new Redis(env.REDIS_URL, options);
  }
  return new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    ...options,
  });
}

const connection = createRedisConnection();

// Separate pub/sub publisher client
const publisher = createRedisConnection();

// ---------------------------------------------------------------------------
// MinIO client
// ---------------------------------------------------------------------------
const minioClient = new MinioClient({
  endPoint: env.MINIO_ENDPOINT,
  port: env.MINIO_PORT,
  useSSL: env.MINIO_USE_SSL,
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
});

const BUCKET = env.MINIO_BUCKET;

// ---------------------------------------------------------------------------
// Job payload type
// ---------------------------------------------------------------------------
interface CompilationJobData {
  compilationId: string;
  projectId: string;
  /**
   * Convert to DOCX after the PDF succeeds. Opt-in: a plain compile must not
   * pay for an export the user did not request.
   */
  exportDocx?: boolean;
}

type FrozenManifest = { mainFile: string; compiler: string;
  files: Array<{ path: string; sha256: string; isBinary: boolean }> };

function sourceHash(manifest: FrozenManifest): string {
  const canonical = JSON.stringify({
    files: [...manifest.files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
      .map((file) => [file.path, file.sha256, file.isBinary ? 1 : 0]),
    mainFile: manifest.mainFile, compiler: manifest.compiler,
  });
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

async function frozenInput(compilationId: string) {
  const compilation = await prisma.compilation.findUniqueOrThrow({ where: { id: compilationId } });
  if (compilation.status === 'cancelled' || compilation.cancelRequestedAt) return null;
  let manifest: FrozenManifest;
  let files: Array<{ path: string; sha256: string; isBinary: boolean;
    textContent: string | null; binaryContent: Uint8Array | null; blobKey: string | null }>;
  let storedHash: string | null;
  if (compilation.sourceSnapshotId) {
    const source = await prisma.sourceSnapshot.findUniqueOrThrow({ where: { id: compilation.sourceSnapshotId } });
    manifest = source.manifest as unknown as FrozenManifest;
    storedHash = source.sourceHash;
    files = await prisma.snapshotFile.findMany({ where: { snapshotId: source.id } });
  } else if (compilation.candidateSnapshotId) {
    const candidate = await prisma.candidateSnapshot.findUniqueOrThrow({ where: { id: compilation.candidateSnapshotId } });
    manifest = candidate.manifest as unknown as FrozenManifest;
    storedHash = candidate.sourceHash;
    files = await prisma.candidateSnapshotFile.findMany({ where: { candidateSnapshotId: candidate.id } });
  } else {
    throw new Error('Legacy compilation job has no frozen source');
  }
  if (!storedHash || sourceHash(manifest) !== storedHash || compilation.sourceHash !== storedHash
    || files.length !== manifest.files.length) {
    throw new Error('Frozen compilation source hash or file set mismatch');
  }
  const expected = new Map(manifest.files.map((file) => [file.path, file]));
  const mapped = files.map((file) => {
    const entry = expected.get(file.path);
    if (!entry || entry.sha256 !== file.sha256 || entry.isBinary !== file.isBinary) {
      throw new Error(`Frozen compilation file metadata mismatch: ${file.path}`);
    }
    return { path: file.path, sha256: file.sha256, isBinary: file.isBinary,
      minioKey: file.blobKey,
      content: file.isBinary
        ? file.binaryContent ? Buffer.from(file.binaryContent).toString('base64') : null
        : file.textContent };
  });
  if (!mapped.some((file) => file.path === manifest.mainFile)
    || !['pdflatex', 'xelatex', 'lualatex'].includes(manifest.compiler)) {
    throw new Error('Frozen compilation has invalid main file or compiler');
  }
  return { projectId: compilation.projectId, mainFile: manifest.mainFile,
    compiler: manifest.compiler as CompilerType, files: mapped };
}

const MAX_COMPILATION_FILES = 500;
const LEASE_MS = 25_000;

// ---------------------------------------------------------------------------
// Helper: download all project files into a temp directory, preserving paths
// ---------------------------------------------------------------------------
async function downloadProjectFiles(
  files: NonNullable<Awaited<ReturnType<typeof frozenInput>>>['files'],
  workDir: string,
): Promise<void> {
  await materializeFiles(files, workDir, (key, destination) =>
    minioClient.fGetObject(BUCKET, key, destination));
}

// ---------------------------------------------------------------------------
// Helper: upload a local file to MinIO and return the key
// ---------------------------------------------------------------------------
let bucketReady = false;
async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  if (!(await minioClient.bucketExists(BUCKET))) {
    try {
      await minioClient.makeBucket(BUCKET);
    } catch (error) {
      // Another worker may have created it after our existence check.
      if (!(await minioClient.bucketExists(BUCKET))) throw error;
    }
  }
  bucketReady = true;
}

async function uploadFile(localPath: string, minioKey: string): Promise<void> {
  const info = await fs.promises.lstat(localPath);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 55 * 1024 * 1024) {
    throw new Error('Refusing unsafe compilation artifact');
  }
  await ensureBucket();
  await minioClient.fPutObject(BUCKET, minioKey, localPath);
}

// ---------------------------------------------------------------------------
// Helper: publish a status update to the Redis channel for this compilation
// ---------------------------------------------------------------------------
async function publishStatus(compilationId: string, payload: object): Promise<void> {
  try {
    await publisher.publish(`compilation:${compilationId}`, JSON.stringify(payload));
  } catch (error) {
    console.error('[worker] Status notification failed; database status remains authoritative:', error);
  }
}

// ---------------------------------------------------------------------------
// BullMQ worker
// ---------------------------------------------------------------------------
// Cap retries explicitly. Without `attempts` BullMQ uses sensible defaults
// but a misconfigured queue could otherwise retry a poison job forever,
// silently draining the worker. Three attempts with exponential backoff is
// the same shape as our other queue-bound jobs.
const WORKER_ATTEMPTS = env.WORKER_MAX_ATTEMPTS;
const WORKER_LOCK_DURATION_MS = env.WORKER_LOCK_DURATION_MS;

const inFlight = new Set<string>();

const worker = new Worker<CompilationJobData>(
  'compilation',
  async (job: Job<CompilationJobData>) => {
    const { compilationId, projectId } = job.data;
    if (!env.COMPILE_DATA_PATH) throw new Error('Isolated compile data volume is not configured');
    inFlight.add(compilationId);

    console.log(`[worker] Starting job ${job.id} — compilationId=${compilationId} attempt=${job.attemptsMade + 1}/${WORKER_ATTEMPTS}`);

    const attemptId = crypto.randomUUID();
    const workDir = path.join(env.COMPILE_DATA_PATH, compilationId, attemptId);
    let cancelPoll: NodeJS.Timeout | undefined;

    try {
      fs.mkdirSync(path.join(workDir, 'input'), { recursive: true, mode: 0o755 });
      fs.mkdirSync(path.join(workDir, 'output'), { mode: 0o755 });
      const input = await frozenInput(compilationId);
      if (!input) {
        await prisma.compilation.updateMany({ where: { id: compilationId,
          status: { in: ['pending_dispatch', 'queued'] } },
          data: { status: 'cancelled', log: 'Compilation cancelled before start' } });
        return;
      }
      if (input.projectId !== projectId) throw new Error('Compilation job project mismatch');
      const { mainFile, compiler, files } = input;
      if (files.length > MAX_COMPILATION_FILES) {
        throw new Error(`Compilation has ${files.length} files; limit is ${MAX_COMPILATION_FILES}`);
      }

      // 1. Materialize authoritative DB text and immutable binary objects.
      await downloadProjectFiles(files, path.join(workDir, 'input'));

      const compilation = await prisma.compilation.findUniqueOrThrow({ where: { id: compilationId },
        select: { sourceHash: true, buildFingerprint: true } });
      const expectedFingerprint = compilation.sourceHash && env.TEX_IMAGE_DIGEST
        ? crypto.createHash('sha256').update(JSON.stringify([compilation.sourceHash, env.TEX_IMAGE_DIGEST])).digest('hex')
        : null;
      if (!expectedFingerprint || compilation.buildFingerprint !== expectedFingerprint) {
        throw new Error('Frozen build fingerprint does not match the approved TeX image');
      }

      // 2. Claim the job in PostgreSQL before announcing it.
      const claimed = await prisma.compilation.updateMany({
        where: { id: compilationId, status: { in: ['pending_dispatch', 'queued'] },
          cancelRequestedAt: null, attemptCount: { lt: WORKER_ATTEMPTS } },
        data: { status: 'compiling', attemptId, attemptCount: { increment: 1 },
          startedAt: new Date(), leaseExpiresAt: new Date(Date.now() + LEASE_MS) },
      });
      if (claimed.count === 0) return;
      await publishStatus(compilationId, { status: 'compiling', compilationId });

      // 3. Compile. The PDF is the deliverable; DOCX is a separate, explicit step.
      let cancelSent = false;
      cancelPoll = setInterval(() => {
        void (async () => {
          const row = await prisma.compilation.findUnique({ where: { id: compilationId },
            select: { cancelRequestedAt: true, attemptId: true } });
          if (row?.cancelRequestedAt || row?.attemptId !== attemptId) {
            if (!cancelSent) {
              cancelSent = true;
              await cancelCompile(attemptId);
            }
          } else {
            const renewed = await prisma.compilation.updateMany({
              where: { id: compilationId, attemptId, status: 'compiling', cancelRequestedAt: null },
              data: { leaseExpiresAt: new Date(Date.now() + LEASE_MS) },
            });
            if (renewed.count === 0 && !cancelSent) {
              cancelSent = true;
              await cancelCompile(attemptId);
            }
          }
        })().catch((error) => console.error('[worker] Lease/cancel poll failed:', error));
      }, 3000);
      const result = await compileLatex(compilationId, attemptId, workDir, mainFile, compiler,
        Boolean(job.data.exportDocx));
      const cancelled = result.cancelled || Boolean((await prisma.compilation.findUnique({
        where: { id: compilationId }, select: { cancelRequestedAt: true },
      }))?.cancelRequestedAt);
      if (cancelled) {
        await cancelCompile(attemptId);
        await prisma.compilation.updateMany({ where: { id: compilationId, attemptId, status: 'compiling' },
          data: { status: 'cancelled', log: 'Compilation cancelled', leaseExpiresAt: null } });
        await publishStatus(compilationId, { status: 'cancelled', compilationId });
        return;
      }

      // 5. Upload PDF and synctex.gz to MinIO if they exist
      let pdfMinioKey: string | undefined;
      let synctexMinioKey: string | undefined;
      let docxMinioKey: string | undefined;

      if (result.pdfPath) {
        pdfMinioKey = `compilations/${projectId}/${compilationId}/attempts/${attemptId}/output.pdf`;
        await uploadFile(result.pdfPath, pdfMinioKey);
      }

      if (result.synctexPath) {
        synctexMinioKey = `compilations/${projectId}/${compilationId}/attempts/${attemptId}/output.synctex.gz`;
        await uploadFile(result.synctexPath, synctexMinioKey);
      }

      // DOCX only when the job explicitly asked for it. Previously every
      // compile awaited pandoc, delaying the PDF for an export almost nobody
      // wanted; the conversion also ran after durationMs was captured, so the
      // recorded timing did not reflect the real wall clock.
      if (job.data.exportDocx && result.docxPath) {
        docxMinioKey = `compilations/${projectId}/${compilationId}/attempts/${attemptId}/output.docx`;
        await uploadFile(result.docxPath, docxMinioKey);
      }

      // 6. Update the compilations table in PostgreSQL
      const finalStatus = result.success ? 'success' : 'failed';
      const persisted = await prisma.compilation.updateMany({
        where: { id: compilationId, attemptId, status: 'compiling', cancelRequestedAt: null,
          leaseExpiresAt: { gt: new Date() } },
        data: {
          status: finalStatus,
          log: result.log,
          pdfMinioKey: pdfMinioKey ?? null,
          synctexMinioKey: synctexMinioKey ?? null,
          docxMinioKey: docxMinioKey ?? null,
          durationMs: result.durationMs,
          leaseExpiresAt: null,
        },
      });
      if (persisted.count === 0) {
        await cancelCompile(attemptId);
        await prisma.compilation.updateMany({
          where: { id: compilationId, attemptId, status: 'compiling',
            cancelRequestedAt: { not: null } },
          data: { status: 'cancelled', log: 'Compilation cancelled', leaseExpiresAt: null },
        });
        return;
      }

      // 7. Publish result via Redis pub/sub for real-time notification
      await publishStatus(compilationId, {
        status: finalStatus,
        compilationId,
        durationMs: result.durationMs,
        pdfMinioKey,
        synctexMinioKey,
        docxMinioKey,
      });

      console.log(
        `[worker] Job ${job.id} finished — status=${finalStatus} durationMs=${result.durationMs}`,
      );
    } catch (error) {
      const state = await prisma.compilation.findUnique({ where: { id: compilationId },
        select: { cancelRequestedAt: true, attemptId: true } }).catch(() => null);
      if (state?.attemptId === attemptId && state.cancelRequestedAt) {
        await cancelCompile(attemptId);
        await prisma.compilation.updateMany({ where: { id: compilationId, attemptId, status: 'compiling' },
          data: { status: 'cancelled', log: 'Compilation cancelled', leaseExpiresAt: null } });
        return;
      }
      await prisma.compilation.updateMany({
        where: { id: compilationId, attemptId, status: 'compiling', cancelRequestedAt: null },
        data: { status: 'queued', leaseExpiresAt: null,
          log: `Worker retry: ${error instanceof Error ? error.message : 'unknown error'}` },
      }).catch((dbError) => console.error('[worker] Could not reset retry status:', dbError));
      throw error;
    } finally {
      if (cancelPoll) clearInterval(cancelPoll);
      // 8. Cleanup temp directory
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.error(`[worker] Failed to clean up temp dir ${workDir}:`, cleanupErr);
      }
      inFlight.delete(compilationId);
    }
  },
  {
    connection,
    lockDuration: WORKER_LOCK_DURATION_MS,
  },
);

// The compilations table is the durable dispatch outbox. A web process may
// commit the row and crash before Redis accepts the job; this loop retries it.
const dispatchQueue = new Queue<CompilationJobData>('compilation', { connection: connection.duplicate() });
async function recoverDispatch(): Promise<void> {
  const pending = await prisma.compilation.findMany({
    where: { status: 'pending_dispatch', cancelRequestedAt: null },
    orderBy: { createdAt: 'asc' }, take: 20,
  });
  for (const row of pending) {
    if (!row.sourceSnapshotId && !row.candidateSnapshotId) {
      await prisma.compilation.update({ where: { id: row.id },
        data: { status: 'failed', log: 'Legacy pending job has no frozen input' } });
      continue;
    }
    await dispatchQueue.add('compile', { compilationId: row.id, projectId: row.projectId },
      { jobId: row.id, attempts: WORKER_ATTEMPTS,
        backoff: { type: 'exponential', delay: 5000 } });
    await prisma.compilation.updateMany({ where: { id: row.id, status: 'pending_dispatch' },
      data: { status: 'queued' } });
  }
  const staleQueued = await prisma.compilation.findMany({ where: {
    status: 'queued', cancelRequestedAt: null,
    createdAt: { lt: new Date(Date.now() - 30_000) },
  }, take: 20 });
  for (const row of staleQueued) {
    if (row.attemptCount >= WORKER_ATTEMPTS) {
      await prisma.compilation.updateMany({ where: { id: row.id, status: 'queued' },
        data: { status: 'failed', log: 'Compilation retry budget exhausted' } });
      continue;
    }
    const jobId = row.attemptId ? `${row.id}-${row.attemptId}` : row.id;
    const previous = await dispatchQueue.getJob(jobId);
    const state = previous ? await previous.getState() : 'missing';
    if (state === 'completed' || state === 'failed') await previous?.remove();
    if (!previous || state === 'completed' || state === 'failed') {
      await dispatchQueue.add('compile', { compilationId: row.id, projectId: row.projectId },
        { jobId, attempts: 1,
          backoff: { type: 'exponential', delay: 5000 } });
    }
  }
  const staleRunning = await prisma.compilation.findMany({ where: {
    status: 'compiling', leaseExpiresAt: { lt: new Date() },
  }, take: 20 });
  for (const row of staleRunning) {
    if (!row.attemptId) continue;
    // Stop and confirm the old container before allowing any new attempt.
    await cancelCompile(row.attemptId);
    const next = row.cancelRequestedAt ? 'cancelled'
      : row.attemptCount >= WORKER_ATTEMPTS ? 'failed' : 'queued';
    await prisma.compilation.updateMany({
      where: { id: row.id, status: 'compiling', attemptId: row.attemptId,
        leaseExpiresAt: { lt: new Date() } },
      data: { status: next, leaseExpiresAt: null,
        log: next === 'queued' ? 'Worker interrupted; retrying frozen source' :
          next === 'cancelled' ? 'Compilation cancelled' : 'Compilation retry budget exhausted' },
    });
  }
}
let recoveryActive = false;
async function runRecovery(): Promise<void> {
  if (recoveryActive) return;
  recoveryActive = true;
  try { await recoverDispatch(); }
  catch (error) { console.error('[worker] Dispatch recovery failed:', error); }
  finally { recoveryActive = false; }
}
void runRecovery();
setInterval(() => {
  void runRecovery();
}, 5000).unref();

worker.on('failed', async (job, err) => {
  console.error(`[worker] Job ${job?.id} failed:`, err?.message);
  // Only mark the compilation row as failed once the final attempt is
  // exhausted — earlier retry failures should leave the row in 'compiling'
  // so the user sees progress instead of a transient red error.
  const exhausted = !job || (job.attemptsMade >= (job.opts?.attempts ?? WORKER_ATTEMPTS));
  if (exhausted && job?.data?.compilationId) {
    try {
      const current = await prisma.compilation.findUnique({
        where: { id: job.data.compilationId }, select: { cancelRequestedAt: true },
      });
      const cancelled = Boolean(current?.cancelRequestedAt);
      const updated = await prisma.compilation.updateMany({
        where: { id: job.data.compilationId, status: 'queued',
          attemptCount: { gte: WORKER_ATTEMPTS } },
        data: { status: cancelled ? 'cancelled' : 'failed',
          log: cancelled ? 'Compilation cancelled' : `Worker error: ${err?.message ?? 'Unknown'}` },
      });
      if (updated.count > 0) await publishStatus(job.data.compilationId, {
        status: cancelled ? 'cancelled' : 'failed',
        compilationId: job.data.compilationId,
        error: err?.message ?? 'Worker error',
      }).catch(() => { /* pub/sub best-effort */ });
    } catch (e) {
      console.error('[worker] Failed to update compilation status:', e);
    }
  }
});

worker.on('completed', (job) => {
  console.log(`[worker] Job ${job.id} completed in ${job.processedOn ? Date.now() - job.processedOn : '?'}ms`);
});

worker.on('error', (err) => {
  console.error('[worker] Worker error:', err);
});

// ---------------------------------------------------------------------------
// Graceful shutdown — close the worker so BullMQ stops picking up new jobs,
// then flag any compilations that were still in flight as failed so the
// user doesn't see a row stuck in "compiling" forever after a deploy.
// ---------------------------------------------------------------------------
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('[worker] Shutting down gracefully...');
  try {
    await worker.close();
  } catch (e) {
    console.error('[worker] worker.close error:', e);
  }
  for (const compilationId of inFlight) {
    try {
      const row = await prisma.compilation.findUnique({ where: { id: compilationId },
        select: { attemptId: true } });
      if (row?.attemptId) await cancelCompile(row.attemptId);
    } catch (e) {
      console.error(`[worker] Failed to flush in-flight ${compilationId}:`, e);
    }
  }
  await publisher.quit().catch(() => {});
  await connection.quit().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log(`[worker] Compilation worker started — attempts=${WORKER_ATTEMPTS}, lockDuration=${WORKER_LOCK_DURATION_MS}ms`);

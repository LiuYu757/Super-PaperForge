import { Queue } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { LIMITS, isValidFilePath } from '@/lib/constants';
import { minioClient, getBucket, ensureBucket } from '@/lib/minio';
import { getFileContent } from '@/services/file-service';
import { env } from '@/lib/env';
import { isRemoteCompileAllowed } from '@/lib/features';
import { compilationQueuePriority, getEntitledPlan } from '@/lib/entitlements';
import { createSnapshot, getSnapshot, manifestOf, computeBuildFingerprint } from '@/services/snapshot-service';
import { claimIdempotency, persistIdempotencyResponse, validateIdempotency } from '@/services/document-mutation-service';

// Cap the bytes we will ever buffer from the upstream LaTeX API. A misbehaving
// or hostile peer could otherwise send an unbounded body and OOM the serverless
// instance during arrayBuffer() / text().
const MAX_COMPILE_RESPONSE_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_COMPILE_ERROR_BYTES = 1 * 1024 * 1024; // 1 MB

/**
 * Read up to `maxBytes` from a fetch Response body without ever holding the
 * full payload in memory. Returns null if the cap is exceeded (caller should
 * treat as a failure) — never a partial buffer.
 */
async function readBoundedBody(res: Response, maxBytes: number): Promise<Buffer | null> {
  // content-length is a hint — short-circuit obviously-too-big responses
  // before opening the stream so honest peers fail fast.
  const declared = Number(res.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    try { await res.body?.cancel(); } catch { /* ignore */ }
    return null;
  }

  if (!res.body) {
    // No body — return empty buffer rather than null so callers can distinguish
    // "too big" (null) from "empty" (zero-length buffer).
    return Buffer.alloc(0);
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.length;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch { /* ignore */ }
      return null;
    }
    chunks.push(value);
  }
  // Copy into a fresh ArrayBuffer-backed Buffer. Allocating the ArrayBuffer
  // explicitly (not via `new Uint8Array(n).buffer`) keeps the return type as
  // Buffer<ArrayBuffer>, which is what Prisma's Bytes column accepts.
  const ab = new ArrayBuffer(total);
  const view = new Uint8Array(ab);
  let offset = 0;
  for (const chunk of chunks) {
    view.set(chunk, offset);
    offset += chunk.length;
  }
  return Buffer.from(ab);
}

let compilationQueue: Queue | null = null;

function parseRedisPort(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (Number.isNaN(parsed) || !Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    return fallback;
  }
  return parsed;
}

function parseRedisDb(pathname: string | undefined, fallback: number): number | undefined {
  if (!pathname || pathname === '/') return fallback ? 0 : undefined;
  const db = Number.parseInt(pathname.slice(1), 10);
  if (Number.isNaN(db) || db < 0 || db > 15) return fallback ? 0 : undefined;
  return db;
}

function getRedisConnectionOptions() {
  if (env.REDIS_URL) {
    const parsed = new URL(env.REDIS_URL);
    const port = parseRedisPort(parsed.port, parseRedisPort(env.REDIS_PORT, 6379));
    return {
      host: parsed.hostname,
      port,
      username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      db: parseRedisDb(parsed.pathname, 0),
      tls: parsed.protocol === 'rediss:' ? {} : undefined,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2000,
    };
  }

  return {
    host: env.REDIS_HOST || 'localhost',
    port: parseRedisPort(env.REDIS_PORT, 6379),
    password: env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 2000,
  };
}

try {
  if (!env.isBuildPhase && (env.REDIS_URL || env.REDIS_HOST)) {
    compilationQueue = new Queue('compilation', {
      connection: getRedisConnectionOptions(),
    });
  }
} catch {
  console.warn('BullMQ queue unavailable (no Redis)');
}

const compilationSelect = {
  id: true,
  projectId: true,
  userId: true,
  status: true,
  compiler: true,
  sourceSnapshotId: true,
  candidateSnapshotId: true,
  sourceHash: true,
  buildFingerprint: true,
  log: true,
  pdfMinioKey: true,
  synctexMinioKey: true,
  docxMinioKey: true,
  durationMs: true,
  createdAt: true,
} as const;

type CompilationAccepted = {
  id: string; projectId: string; userId: string | null; status: string; compiler: string;
  sourceSnapshotId: string | null; candidateSnapshotId: string | null;
  sourceHash: string | null; buildFingerprint: string | null;
  log: string | null; pdfMinioKey: string | null; synctexMinioKey: string | null;
  docxMinioKey: string | null; durationMs: number | null; createdAt: string;
};

/**
 * Serverless-compatible compilation using latex.ytotech.com API.
 * No local pdflatex installation required — works on Vercel.
 */
async function compileViaAPI(
  compilationId: string,
  projectId: string,
  mainFile: string,
  compiler: string,
  files: Array<{ path: string }>,
) {
  const startTime = Date.now();

  try {
    // Collect all file contents from DB/MinIO
    const resources: Array<{ main: boolean; path: string; content: string }> = [];

    for (const file of files) {
      try {
        const content = await getFileContent(projectId, file.path);
        resources.push({
          main: file.path === mainFile,
          path: file.path,
          content: content || '',
        });
      } catch {
        // Skip files that can't be read
      }
    }

    // Check main file exists
    const mainResource = resources.find((r) => r.main);
    if (!mainResource || !mainResource.content) {
      await prisma.compilation.update({
        where: { id: compilationId },
        data: {
          status: 'failed',
          log: `Main file "${mainFile}" not found or empty. Make sure to save (Ctrl+S) before compiling.`,
        },
      });
      return;
    }

    // Build the API request for latex.ytotech.com
    const apiResources = resources.map((r) => ({
      path: r.path,
      content: r.content,
    }));

    const apiBody = {
      compiler: compiler === 'xelatex' ? 'xelatex' : compiler === 'lualatex' ? 'lualatex' : 'pdflatex',
      resources: apiResources,
    };

    const response = await fetch('https://latex.ytotech.com/builds/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apiBody),
      signal: AbortSignal.timeout(120000), // 2 minute timeout
    });

    const durationMs = Date.now() - startTime;

    if (response.ok && response.headers.get('content-type')?.includes('application/pdf')) {
      // Success — got PDF back. Stream with a size cap so a hostile or buggy
      // upstream cannot OOM the instance via an unbounded response body.
      const pdfBuffer = await readBoundedBody(response, MAX_COMPILE_RESPONSE_BYTES);
      if (!pdfBuffer) {
        await prisma.compilation.update({
          where: { id: compilationId },
          data: {
            status: 'failed',
            log: `Compilation output exceeded the ${MAX_COMPILE_RESPONSE_BYTES / 1024 / 1024}MB size limit.`,
            durationMs: Date.now() - startTime,
          },
        });
        return;
      }
      const pdfMinioKey = `compilations/${compilationId}/output.pdf`;

      // Try to store in MinIO; fall back to DB storage
      let minioOk = false;
      try {
        await ensureBucket();
        await minioClient.putObject(getBucket(), pdfMinioKey, pdfBuffer);
        minioOk = true;
      } catch {
        // MinIO unavailable — will store in DB
      }

      await prisma.compilation.update({
        where: { id: compilationId },
        data: {
          status: 'success',
          log: `Compilation successful (${(durationMs / 1000).toFixed(1)}s via LaTeX API)`,
          durationMs,
          pdfMinioKey: minioOk ? pdfMinioKey : null,
          // Prisma's Bytes column wants Uint8Array<ArrayBuffer> strictly,
          // but the bundled Node Buffer types model `.buffer` as the broader
          // ArrayBufferLike. The bytes are equivalent — narrow the type.
          pdfData: minioOk ? null : (pdfBuffer as unknown as Uint8Array<ArrayBuffer>),
        },
      });
    } else {
      // Error — got error response. Bounded read so an oversize error body
      // (e.g. HTML 502 from an intermediary) cannot blow up memory either.
      const errorBuf = await readBoundedBody(response, MAX_COMPILE_ERROR_BYTES).catch(() => null);
      const errorText = errorBuf
        ? errorBuf.toString('utf-8')
        : 'Compilation error response exceeded size limit.';
      await prisma.compilation.update({
        where: { id: compilationId },
        data: {
          status: 'failed',
          log: errorText.slice(0, 100000),
          durationMs,
        },
      });
    }
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : 'Compilation failed';
    await prisma.compilation.update({
      where: { id: compilationId },
      data: {
        status: 'failed',
        log: `Error: ${message}`,
        durationMs,
      },
    });
  }
}

export async function triggerCompilation(projectId: string, userId: string, changeSetId?: string,
  idempotency?: { principal: string; operation: string; idempotencyKey: string; requestHash: string },
  sourceSnapshotId?: string) {
  if (changeSetId && sourceSnapshotId) {
    throw new ApiError(400, 'Choose either changeSetId or snapshotId', 'AMBIGUOUS_COMPILE_SOURCE');
  }
  if (idempotency) {
    validateIdempotency(idempotency);
    const prior = await prisma.idempotencyRecord.findUnique({ where: {
      principal_projectId_operation_idempotencyKey: {
        principal: idempotency.principal, projectId,
        operation: idempotency.operation, idempotencyKey: idempotency.idempotencyKey,
      },
    } });
    if (prior) {
      if (prior.requestHash !== idempotency.requestHash) {
        throw new ApiError(409, 'This Idempotency-Key was already used with a different request body', 'IDEMPOTENCY_KEY_REUSED');
      }
      const stored = prior.response as { compilationId?: string; publicResponse?: CompilationAccepted };
      if (!stored.compilationId || !stored.publicResponse) {
        throw new ApiError(503, 'Idempotency response is incomplete', 'IDEMPOTENCY_INCOMPLETE');
      }
      return { ...stored.publicResponse, id: stored.compilationId, replayed: true };
    }
  }
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: {
      files: { where: { deletedAt: null } },
      members: {
        where: { role: 'owner' },
        select: {
          user: { select: { settings: true, storageQuotaBytes: true } },
        },
        take: 1,
      },
    },
  });
  if (!project) throw new ApiError(404, 'Project not found');

  if (!changeSetId && !sourceSnapshotId && !isValidFilePath(project.mainFile)) {
    throw new ApiError(400, 'Invalid main file path');
  }

  if (!changeSetId && !sourceSnapshotId && project.files.length > LIMITS.MAX_COMPILATION_FILES) {
    throw new ApiError(
      413,
      `Project has ${project.files.length} files; compilation is limited to ${LIMITS.MAX_COMPILATION_FILES} files.`,
      'COMPILATION_FILE_LIMIT',
    );
  }

  let frozen: { sourceSnapshotId: string | null; candidateSnapshotId: string | null;
    sourceHash: string | null; buildFingerprint: string | null; compiler: string; mainFile: string;
    files: Array<{ path: string }> } | null = null;
  if (changeSetId) {
    const candidate = await prisma.candidateSnapshot.findUnique({
      where: { changeSetId }, include: { changeSet: true },
    });
    if (!candidate || candidate.changeSet.projectId !== projectId) {
      throw new ApiError(404, 'Candidate changeset not found', 'NOT_FOUND');
    }
    const manifest = candidate.manifest as unknown as {
      mainFile: string; compiler: string; files: Array<{ path: string }> };
    frozen = { sourceSnapshotId: null, candidateSnapshotId: candidate.id,
      sourceHash: candidate.sourceHash, buildFingerprint: candidate.buildFingerprint,
      compiler: manifest.compiler, mainFile: manifest.mainFile, files: manifest.files };
  } else if (sourceSnapshotId || compilationQueue || !isRemoteCompileAllowed()) {
    const snapshot = sourceSnapshotId
      ? await getSnapshot(projectId, sourceSnapshotId) : await createSnapshot(projectId);
    if (snapshot.sourceHash === null) {
      throw new ApiError(410, 'Legacy snapshot has no frozen bytes', 'LEGACY_SNAPSHOT_UNRECOVERABLE');
    }
    const manifest = manifestOf(snapshot);
    frozen = { sourceSnapshotId: snapshot.id, candidateSnapshotId: null,
      sourceHash: snapshot.sourceHash, buildFingerprint: snapshot.buildFingerprint,
      compiler: manifest.compiler, mainFile: manifest.mainFile, files: manifest.files };
  }
  if (frozen && (!isValidFilePath(frozen.mainFile)
    || frozen.files.length > LIMITS.MAX_COMPILATION_FILES
    || !frozen.files.some((file) => file.path === frozen.mainFile))) {
    throw new ApiError(400, 'Frozen compile source has no valid main file', 'INVALID_COMPILE_SOURCE');
  }

  const data = { projectId, userId,
      status: frozen ? 'pending_dispatch' : 'queued',
      compiler: frozen?.compiler ?? project.compiler,
      sourceSnapshotId: frozen?.sourceSnapshotId ?? null,
      candidateSnapshotId: frozen?.candidateSnapshotId ?? null,
      sourceHash: frozen?.sourceHash ?? null,
      // Bind each compile request to the currently selected TeX runtime. A
      // historical source snapshot can be rebuilt under a newer image without
      // pretending its original runtime identity still applies.
      buildFingerprint: frozen?.sourceHash
        ? computeBuildFingerprint(frozen.sourceHash, env.TEX_RUNTIME_FINGERPRINT) : null };
  const claimed = await prisma.$transaction(async (tx) => {
    if (idempotency) {
      const claim = await claimIdempotency(tx, projectId, idempotency);
      if (claim.replayed) {
        const stored = claim.response as { compilationId?: string; publicResponse?: CompilationAccepted };
        if (!stored.compilationId || !stored.publicResponse) {
          throw new ApiError(503, 'Idempotency response is incomplete', 'IDEMPOTENCY_INCOMPLETE');
        }
        return { id: stored.compilationId, replayed: true, publicResponse: stored.publicResponse };
      }
    }
    const row = await tx.compilation.create({ data });
    const publicResponse: CompilationAccepted = { id: row.id, projectId: row.projectId, userId: row.userId,
      status: row.status, compiler: row.compiler, sourceSnapshotId: row.sourceSnapshotId,
      candidateSnapshotId: row.candidateSnapshotId, sourceHash: row.sourceHash,
      buildFingerprint: row.buildFingerprint, log: row.log, pdfMinioKey: row.pdfMinioKey,
      synctexMinioKey: row.synctexMinioKey, docxMinioKey: row.docxMinioKey,
      durationMs: row.durationMs, createdAt: row.createdAt.toISOString() };
    if (idempotency) {
      await persistIdempotencyResponse(tx, projectId, idempotency,
        { compilationId: row.id, publicResponse });
    }
    await tx.auditLog.create({ data: { adminId: userId,
      action: 'project.compiled', targetType: 'project', targetId: projectId,
      details: { compilationId: row.id, candidate: changeSetId ?? null } } });
    return { id: row.id, replayed: false, publicResponse };
  });
  if (claimed.replayed) {
    return { ...claimed.publicResponse, replayed: true };
  }
  const compilation = { id: claimed.id };

  if (compilationQueue) {
    const owner = project.members[0]?.user;
    const priority = compilationQueuePriority(getEntitledPlan(owner ?? {}));

    // Production mode with Redis: use BullMQ queue
    try {
      await compilationQueue.add('compile', { compilationId: compilation.id, projectId },
        { jobId: compilation.id, priority, attempts: 2,
          backoff: { type: 'exponential', delay: 5000 } });
      await prisma.compilation.updateMany({ where: { id: compilation.id, status: 'pending_dispatch' },
        data: { status: 'queued' } });
    } catch {
      // The database row is the durable outbox. The worker dispatcher retries.
    }
  } else if (!frozen && isRemoteCompileAllowed()) {
    // Serverless fallback: finish the external API call before returning.
    // Fire-and-forget work can be terminated after the HTTP response on serverless hosts.
    await compileViaAPI(
      compilation.id,
      projectId,
      project.mainFile,
      project.compiler,
      project.files.map((f) => ({ path: f.path })),
    );

    const row = await prisma.compilation.findUnique({
      where: { id: compilation.id },
      select: compilationSelect,
    });
    return idempotency ? { ...claimed.publicResponse, replayed: false }
      : row ? { ...row, replayed: false } : null;
  } else {
    // Local-only compilation with no queue available.
    //
    // Never fall back to the third-party LaTeX API here: that would upload the
    // full manuscript off-box precisely when the operator has asked for local
    // compilation. Persist the job as awaiting dispatch and report it honestly
    // so the request neither silently succeeds nor loses the work.
    const row = await prisma.compilation.findUnique({
      where: { id: compilation.id },
      select: compilationSelect,
    });
    return idempotency ? { ...claimed.publicResponse, replayed: false }
      : row ? { ...row, replayed: false } : null;
  }

  const row = await prisma.compilation.findUnique({
    where: { id: compilation.id }, select: compilationSelect,
  });
  return idempotency ? { ...claimed.publicResponse, replayed: false }
    : row ? { ...row, replayed: false } : null;
}

export async function getCompilationStatus(compilationId: string, projectId?: string) {
  return prisma.compilation.findFirst({
    where: { id: compilationId, ...(projectId ? { projectId } : {}) },
    select: {
      id: true,
      status: true,
      log: true,
      sourceSnapshotId: true,
      candidateSnapshotId: true,
      sourceHash: true,
      buildFingerprint: true,
      cancelRequestedAt: true,
      durationMs: true,
      createdAt: true,
      docxMinioKey: true,
    },
  });
}

export async function requestCompilationCancel(projectId: string, compilationId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM compilations WHERE id = ${compilationId}::uuid
        AND project_id = ${projectId}::uuid FOR UPDATE
    `;
    if (locked.length === 0) throw new ApiError(404, 'Compilation not found', 'NOT_FOUND');
    const row = await tx.compilation.findFirst({ where: { id: compilationId, projectId } });
    if (!row) throw new ApiError(404, 'Compilation not found', 'NOT_FOUND');
    if (['success', 'failed', 'cancelled'].includes(row.status)) return row;
    const updated = await tx.compilation.update({ where: { id: compilationId }, data: {
      cancelRequestedAt: new Date(),
      status: row.status === 'compiling' ? 'compiling' : 'cancelled',
      ...(row.status === 'compiling' ? {} : { log: 'Compilation cancelled before start' }),
    } });
    await tx.auditLog.create({ data: { adminId: actorId,
      action: 'compilation.cancel_requested', targetType: 'project', targetId: projectId,
      details: { compilationId } } });
    return updated;
  });
}

export async function getLatestCompilation(projectId: string) {
  return prisma.compilation.findFirst({
    where: { projectId, status: 'success' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      durationMs: true,
      createdAt: true,
      pdfMinioKey: true,
      docxMinioKey: true,
    },
  });
}

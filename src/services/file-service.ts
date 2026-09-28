import fs from 'fs';
import crypto from 'crypto';
import pathModule from 'path';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { minioClient, getBucket, ensureBucket } from '@/lib/minio';
import { ApiError } from '@/lib/errors';
import { applyDocumentMutations } from '@/services/document-mutation-service';

/**
 * Local filesystem fallback for file storage when MinIO is unavailable.
 * Used for development and single-user deployments.
 */
const LOCAL_STORAGE = pathModule.join(env.LOCAL_STORAGE_PATH || (process.cwd() + '/.local-storage'));

function localPath(minioKey: string): string {
  const resolved = pathModule.resolve(LOCAL_STORAGE, minioKey);
  if (!resolved.startsWith(pathModule.resolve(LOCAL_STORAGE) + pathModule.sep)) {
    throw new Error('Path traversal blocked');
  }
  return resolved;
}

async function writeLocal(minioKey: string, buffer: Buffer): Promise<void> {
  const dest = localPath(minioKey);
  await fs.promises.mkdir(pathModule.dirname(dest), { recursive: true });
  await fs.promises.writeFile(dest, buffer);
}

async function readLocal(minioKey: string): Promise<Buffer | null> {
  try {
    return await fs.promises.readFile(localPath(minioKey));
  } catch {
    return null;
  }
}

/**
 * Uploads text content through the unified mutation core (PR-1).
 *
 * PostgreSQL is the single authority for committed text; nothing is written to
 * MinIO here. `project.revision` is advanced in the same transaction (R03), so
 * an external changeset based on an older revision can no longer be applied on
 * top of this write.
 *
 * Kept as a thin wrapper so template seeding, imports and other bootstrap
 * callers keep their existing signature; every path lands in the same core.
 */
export async function createFile(
  projectId: string,
  path: string,
  content: string,
) {
  const applied = await applyDocumentMutations({
    projectId,
    mutations: [{ kind: 'upsertText', path, content }],
  });
  return prisma.file.findUniqueOrThrow({
    where: { id: applied.files[0]?.id ?? '' },
  });
}

/**
 * Reads file content. PostgreSQL `content` is the single authority for text
 * (PR-1, R02): a changeset apply or plain save updates the DB atomically with
 * the revision bump, and no write path touches MinIO for text anymore, so the
 * DB can never be behind the object store. MinIO remains the authority for
 * binary attachments; the local-filesystem fallback is the dev convenience.
 *
 * Legacy rows with `content` null are migrated by `scripts/report-text-source.mjs`;
 * until then they fall back to MinIO/local so no existing file disappears.
 */
export async function getFileContent(projectId: string, path: string): Promise<string> {
  const file = await prisma.file.findFirst({
    where: { projectId, path, deletedAt: null },
  });
  if (!file) throw new ApiError(404, 'File not found');

  // 1. Binary attachments: MinIO is the authority (unchanged behaviour).
  if (file.isBinary) {
    if (file.minioKey) {
      try {
        const stream = await minioClient.getObject(getBucket(), file.minioKey);
        const chunks: Buffer[] = [];
        for await (const chunk of stream as AsyncIterable<Buffer>) {
          chunks.push(chunk);
        }
        return Buffer.concat(chunks).toString('utf-8');
      } catch {
        if (!env.MINIO_ALLOW_FALLBACK && !file.content) {
          throw new ApiError(503, 'Object storage is unavailable');
        }
      }
    }
  } else if (file.content !== null) {
    // 2. Text: the PostgreSQL column is authoritative. Read it, not MinIO.
    return file.content;
  }

  // 3. Legacy text row (content null, object store only) — migrate, don't drop.
  if (file.minioKey) {
    try {
      if (!file.isBinary) {
        const stream = await minioClient.getObject(getBucket(), file.minioKey);
        const chunks: Buffer[] = [];
        for await (const chunk of stream as AsyncIterable<Buffer>) {
          chunks.push(chunk);
        }
        return Buffer.concat(chunks).toString('utf-8');
      }
    } catch {
      if (!env.MINIO_ALLOW_FALLBACK) {
        throw new ApiError(503, 'Object storage is unavailable');
      }
    }
  }

  // 4. Local filesystem (dev fallback)
  if (file.minioKey && env.MINIO_ALLOW_FALLBACK) {
    const localBuf = await readLocal(file.minioKey);
    if (localBuf) return localBuf.toString('utf-8');
  }

  throw new ApiError(503,
    'Text content is not migrated and its legacy bytes are unavailable',
    'CONTENT_NOT_MIGRATED');
}

/**
 * Read a file's exact bytes for downloads (PR-B): text comes from the
 * authoritative DB column as UTF-8; binary attachments come from MinIO (or
 * the base64 DB copy written when object storage was unavailable). A JSON
 * round-trip would re-encode binary data through UTF-8 and corrupt it, so
 * downloads must use this byte-preserving path.
 */
export async function getFileBuffer(
  projectId: string,
  path: string,
): Promise<{ buffer: Buffer; mimeType: string | null; isBinary: boolean }> {
  const file = await prisma.file.findFirst({
    where: { projectId, path, deletedAt: null },
  });
  if (!file) throw new ApiError(404, 'File not found');

  if (!file.isBinary && file.content !== null) {
    return {
      buffer: Buffer.from(file.content, 'utf-8'),
      mimeType: file.mimeType ?? 'text/plain; charset=utf-8',
      isBinary: false,
    };
  }

  if (file.minioKey) {
    try {
      const stream = await minioClient.getObject(getBucket(), file.minioKey);
      const chunks: Buffer[] = [];
      for await (const chunk of stream as AsyncIterable<Buffer>) {
        chunks.push(chunk);
      }
      return {
        buffer: Buffer.concat(chunks),
        mimeType: file.mimeType,
        isBinary: file.isBinary,
      };
    } catch {
      if (!env.MINIO_ALLOW_FALLBACK && !(file.isBinary && file.content !== null)) {
        throw new ApiError(503, 'Object storage is unavailable');
      }
    }
    const localBuf = await readLocal(file.minioKey);
    if (localBuf) {
      return { buffer: localBuf, mimeType: file.mimeType, isBinary: file.isBinary };
    }
  }

  // Small binaries uploaded while object storage was unavailable keep a
  // base64 copy in the content column.
  if (file.isBinary && file.content !== null) {
    return {
      buffer: Buffer.from(file.content, 'base64'),
      mimeType: file.mimeType,
      isBinary: true,
    };
  }

  throw new ApiError(503, 'File bytes are not available');
}

/**
 * SHA-256 of the UTF-8 bytes of `content`, lowercase hex.
 *
 * This is the version token used by conditional writes (`If-Match`) and by the
 * external-AI changeset contract (`expectedSha256`). Both sides must hash the
 * exact bytes, with no normalisation of line endings or Unicode — rewriting
 * content before hashing would let a "matching" precondition overwrite text the
 * caller never saw.
 */
export function sha256Text(content: string): string {
  return crypto.createHash('sha256').update(Buffer.from(content, 'utf-8')).digest('hex');
}

/**
 * Current SHA-256 of a text file, or null when no active file exists at `path`.
 *
 * Returns null (rather than the hash of '') for a missing file so callers can
 * distinguish "absent" from "present but empty".
 */
export async function getFileSha256IfExists(
  projectId: string,
  path: string,
): Promise<string | null> {
  const file = await prisma.file.findFirst({
    where: { projectId, path, deletedAt: null },
    select: { id: true },
  });
  if (!file) return null;
  return sha256Text(await getFileContent(projectId, path));
}

/**
 * Returns all non-deleted files for a project, sorted by path.
 */
export async function listFiles(projectId: string) {
  return prisma.file.findMany({
    where: { projectId, deletedAt: null },
    orderBy: { path: 'asc' },
    select: {
      id: true,
      path: true,
      isBinary: true,
      sizeBytes: true,
      mimeType: true,
      updatedAt: true,
    },
  });
}

/**
 * Soft-deletes a file through the unified mutation core: the deletion and the
 * project revision bump commit atomically (R03), so versioned clients detect a
 * concurrent delete instead of silently overwriting a vanished file.
 */
export async function deleteFile(projectId: string, path: string) {
  const file = await prisma.file.findFirst({
    where: { projectId, path, deletedAt: null },
  });
  if (!file) throw new ApiError(404, 'File not found');

  await applyDocumentMutations({
    projectId,
    mutations: [{ kind: 'delete', path }],
  });

  return file;
}

/**
 * Uploads binary data to MinIO and upserts the File record with isBinary=true.
 * For small binary files (< 4MB), a base64-encoded copy is stored in the DB
 * content column so the file survives when MinIO is unavailable (e.g., Vercel).
 */
export async function stageBinaryBlob(projectId: string, buffer: Buffer): Promise<{
  minioKey: string;
  dbContent: string | null;
  cleanup: () => Promise<void>;
}> {
  const minioKey = `projects/${projectId}/blobs/${crypto.randomUUID()}`;
  let minioAvailable = false;
  try {
    await ensureBucket();
    await minioClient.putObject(getBucket(), minioKey, buffer);
    minioAvailable = true;
  } catch {
    if (!env.MINIO_ALLOW_FALLBACK) {
      throw new ApiError(503, 'Object storage is unavailable');
    }
    await writeLocal(minioKey, buffer);
  }
  return {
    minioKey,
    dbContent: !minioAvailable && buffer.length < 4 * 1024 * 1024
      ? buffer.toString('base64') : null,
    cleanup: async () => {
      if (minioAvailable) await minioClient.removeObject(getBucket(), minioKey).catch(() => {});
      else await fs.promises.unlink(localPath(minioKey)).catch(() => {});
    },
  };
}

export async function uploadBinaryFile(
  projectId: string,
  path: string,
  buffer: Buffer,
  mimeType: string,
  actorId?: string,
) {
  // Every upload gets a fresh object key. Replacing a path never overwrites
  // bytes still referenced by an earlier revision or in-flight compilation.
  const project = await prisma.project.findUnique({
    where: { id: projectId }, select: { revision: true, deletedAt: true },
  });
  if (!project || project.deletedAt) throw new ApiError(404, 'Project not found');

  const staged = await stageBinaryBlob(projectId, buffer);

  try {
    const applied = await applyDocumentMutations({
      projectId,
      actorId,
      expectedRevision: project.revision,
      mutations: [{ kind: 'upsertBinary', path, minioKey: staged.minioKey,
        content: staged.dbContent, sizeBytes: buffer.length, mimeType }],
    });
    return prisma.file.findUniqueOrThrow({ where: { id: applied.files[0].id } });
  } catch (error) {
    // The DB transaction rolled back. The unique staged object has no reader.
    await staged.cleanup();
    throw error;
  }
}

import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { getFileBuffer, stageBinaryBlob } from '@/services/file-service';
import { getBucket, minioClient } from '@/lib/minio';
import { env } from '@/lib/env';

/** A frozen manifest entry. The hash is over actual bytes, including binaries. */
export interface SnapshotFileEntry {
  fileId: string;
  path: string;
  sha256: string;
  sizeBytes: number;
  isBinary: boolean;
  minioKey: string | null;
}

export interface SnapshotManifest {
  files: SnapshotFileEntry[];
  mainFile: string;
  compiler: string;
}

export function sha256Bytes(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/** Full source identity: every path, real byte hash, main file and compiler. */
export function computeInputHash(manifest: SnapshotManifest): string {
  const canonical = JSON.stringify({
    files: [...manifest.files]
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
      .map((f) => [f.path, f.sha256, f.isBinary ? 1 : 0]),
    mainFile: manifest.mainFile,
    compiler: manifest.compiler,
  });
  return crypto.createHash('sha256').update(canonical, 'utf-8').digest('hex');
}

/** Build identity is only complete when the operator pins the TeX runtime. */
export function computeBuildFingerprint(sourceHash: string, runtimeFingerprint: string): string | null {
  if (!runtimeFingerprint) return null;
  return sha256Bytes(Buffer.from(JSON.stringify([sourceHash, runtimeFingerprint]), 'utf-8'));
}

export function revisionToString(revision: bigint): string {
  return revision.toString(10);
}

export function parseRevision(raw: unknown): bigint {
  if (typeof raw === 'bigint') return raw;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
    throw new ApiError(400, 'baseRevision must be a decimal string');
  }
  return BigInt(raw);
}

type PreparedBinary = {
  fileId: string;
  keyAtRead: string | null;
  sizeAtRead: bigint;
  hash: string;
  bytes: Buffer | null;
  blobKey: string | null;
  cleanup?: () => Promise<void>;
};

/**
 * Freeze a consistent project revision. Binary reads and any legacy-object copy
 * happen before the transaction; the project row lock and revision/row checks
 * then ensure those bytes belong to exactly the committed state being frozen.
 * Text is copied from PostgreSQL inside that transaction. No object-store call
 * runs while a database lock is held.
 */
export async function createSnapshot(projectId: string) {
  const initial = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: {
      revision: true,
      files: { where: { deletedAt: null },
        select: { id: true, path: true, isBinary: true, sizeBytes: true,
          minioKey: true, content: true },
      },
    },
  });
  if (!initial) throw new ApiError(404, 'Project not found');

  const prepared = new Map<string, PreparedBinary>();
  const staged: Array<() => Promise<void>> = [];
  let committed = false;
  try {
    for (const file of initial.files) {
      if (!file.isBinary) continue;
      const source = await getFileBuffer(projectId, file.path);
      if (source.buffer.length !== Number(file.sizeBytes)) {
        throw new ApiError(409, `Binary size changed while snapshotting ${file.path}`, 'SOURCE_CHANGED');
      }
      const result: PreparedBinary = {
        fileId: file.id, keyAtRead: file.minioKey, sizeAtRead: file.sizeBytes,
        hash: sha256Bytes(source.buffer), bytes: null, blobKey: null,
      };
      if (file.content !== null) {
        // A DB fallback is frozen in the snapshot itself; verify it agrees
        // with the bytes returned by the normal read path.
        const dbBytes = Buffer.from(file.content, 'base64');
        if (!dbBytes.equals(source.buffer)) {
          throw new ApiError(409, `Binary copies diverged for ${file.path}`, 'SOURCE_DIVERGED');
        }
        result.bytes = source.buffer;
      } else if (file.minioKey?.startsWith(`projects/${projectId}/blobs/`)) {
        result.blobKey = file.minioKey;
      } else {
        const copy = await stageBinaryBlob(projectId, source.buffer);
        staged.push(copy.cleanup);
        if (copy.dbContent !== null) result.bytes = source.buffer;
        else result.blobKey = copy.minioKey;
        result.cleanup = copy.cleanup;
      }
      prepared.set(file.id, result);
    }

    const outcome = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string; revision: bigint }>>`
        SELECT id, revision FROM projects
        WHERE id = ${projectId}::uuid AND deleted_at IS NULL FOR UPDATE
      `;
      if (!locked[0] || locked[0].revision !== initial.revision) {
        throw new ApiError(409, 'Project changed while creating snapshot', 'SOURCE_CHANGED');
      }
      const project = await tx.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { revision: true, mainFile: true, compiler: true,
          files: { where: { deletedAt: null }, select: {
            id: true, path: true, isBinary: true, sizeBytes: true,
            minioKey: true, content: true, mimeType: true,
          } },
        },
      });
      if (project.files.length !== initial.files.length) {
        throw new ApiError(409, 'File set changed while creating snapshot', 'SOURCE_CHANGED');
      }
      const manifest: SnapshotManifest = {
        mainFile: project.mainFile, compiler: project.compiler, files: [],
      };
      const frozen: Array<{
        fileId: string; path: string; sha256: string; sizeBytes: bigint;
        isBinary: boolean; mimeType: string | null; textContent: string | null;
        binaryContent: Uint8Array<ArrayBuffer> | null; blobKey: string | null;
      }> = [];
      for (const file of project.files) {
        if (file.isBinary) {
          const source = prepared.get(file.id);
          if (!source || source.keyAtRead !== file.minioKey
            || source.sizeAtRead !== file.sizeBytes) {
            throw new ApiError(409, 'Binary source changed while creating snapshot', 'SOURCE_CHANGED');
          }
          manifest.files.push({ fileId: file.id, path: file.path,
            sha256: source.hash, sizeBytes: Number(file.sizeBytes),
            isBinary: true, minioKey: source.blobKey });
          frozen.push({ fileId: file.id, path: file.path, sha256: source.hash,
            sizeBytes: file.sizeBytes, isBinary: true, mimeType: file.mimeType,
            textContent: null,
            binaryContent: source.bytes ? Uint8Array.from(source.bytes) : null,
            blobKey: source.blobKey });
        } else {
          if (file.content === null) {
            throw new ApiError(409, `Text file ${file.path} is not migrated`, 'CONTENT_NOT_MIGRATED');
          }
          const hash = sha256Bytes(Buffer.from(file.content, 'utf-8'));
          manifest.files.push({ fileId: file.id, path: file.path,
            sha256: hash, sizeBytes: Buffer.byteLength(file.content, 'utf-8'),
            isBinary: false, minioKey: null });
          frozen.push({ fileId: file.id, path: file.path, sha256: hash,
            sizeBytes: BigInt(Buffer.byteLength(file.content, 'utf-8')),
            isBinary: false, mimeType: file.mimeType, textContent: file.content,
            binaryContent: null, blobKey: null });
        }
      }
      const sourceHash = computeInputHash(manifest);
      const buildFingerprint = computeBuildFingerprint(sourceHash, env.TEX_RUNTIME_FINGERPRINT);
      const existing = await tx.sourceSnapshot.findFirst({
        where: { projectId, revision: project.revision, sourceHash,
          buildFingerprint },
      });
      if (existing) return { snapshot: existing, created: false };
      const snapshot = await tx.sourceSnapshot.create({
        data: { projectId, revision: project.revision,
          manifest: manifest as unknown as object, inputHash: sourceHash,
          sourceHash, buildFingerprint,
          mainFile: project.mainFile, compiler: project.compiler },
      });
      await tx.snapshotFile.createMany({ data: frozen.map((file) => ({
        ...file, snapshotId: snapshot.id,
      })) });
      return { snapshot, created: true };
    }, { timeout: 20_000 });
    committed = outcome.created;
    return outcome.snapshot;
  } finally {
    // Reused snapshots and DB-stored fallback bytes do not reference copies.
    await Promise.all(staged.filter((remove) => !committed
      || ![...prepared.values()].some((p) => p.cleanup === remove && p.blobKey !== null))
      .map((remove) => remove()));
  }
}

export async function getSnapshot(projectId: string, snapshotId: string) {
  const snapshot = await prisma.sourceSnapshot.findFirst({
    where: { id: snapshotId, projectId },
  });
  if (!snapshot) throw new ApiError(404, 'Snapshot not found');
  return snapshot;
}

export function manifestOf(snapshot: { manifest: unknown }): SnapshotManifest {
  return snapshot.manifest as SnapshotManifest;
}

function requireFrozenSnapshot(snapshot: { sourceHash: string | null }): void {
  if (snapshot.sourceHash === null) {
    throw new ApiError(410,
      'This legacy snapshot has no frozen bytes and cannot be read or compiled',
      'LEGACY_SNAPSHOT_UNRECOVERABLE');
  }
}

export async function readSnapshotFileBytes(
  projectId: string, snapshotId: string, fileId: string,
): Promise<{ path: string; bytes: Buffer; sha256: string; isBinary: boolean }> {
  const snapshot = await getSnapshot(projectId, snapshotId);
  requireFrozenSnapshot(snapshot);
  const file = await prisma.snapshotFile.findUnique({
    where: { snapshotId_fileId: { snapshotId, fileId } },
  });
  if (!file) throw new ApiError(404, 'File not found in snapshot');
  let bytes: Buffer;
  if (!file.isBinary && file.textContent !== null) {
    bytes = Buffer.from(file.textContent, 'utf-8');
  } else if (file.binaryContent !== null) {
    bytes = Buffer.from(file.binaryContent);
  } else if (file.blobKey) {
    try {
      const stream = await minioClient.getObject(getBucket(), file.blobKey);
      const chunks: Buffer[] = [];
      for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(chunk);
      bytes = Buffer.concat(chunks);
    } catch {
      throw new ApiError(503, `Frozen binary object is unavailable: ${file.path}`, 'SNAPSHOT_BYTES_UNAVAILABLE');
    }
  } else {
    throw new ApiError(503, `Snapshot bytes are unavailable: ${file.path}`, 'SNAPSHOT_BYTES_UNAVAILABLE');
  }
  if (sha256Bytes(bytes) !== file.sha256) {
    throw new ApiError(503, `Snapshot bytes failed integrity check: ${file.path}`, 'SNAPSHOT_INTEGRITY_FAILED');
  }
  return { path: file.path, bytes, sha256: file.sha256, isBinary: file.isBinary };
}

export async function readSnapshotFile(
  projectId: string, snapshotId: string, fileId: string,
): Promise<{ path: string; content: string; sha256: string }> {
  const file = await readSnapshotFileBytes(projectId, snapshotId, fileId);
  if (file.isBinary) {
    throw new ApiError(400, 'Binary files cannot be read as text; use the artifact endpoint');
  }
  return { path: file.path, content: file.bytes.toString('utf-8'), sha256: file.sha256 };
}

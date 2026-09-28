import * as git from 'isomorphic-git';
import fs from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { env } from '@/lib/env';
import { minioClient, getBucket } from '@/lib/minio';
import { applyDocumentMutations, type TextMutation } from '@/services/document-mutation-service';
import { stageBinaryBlob } from '@/services/file-service';
import { LIMITS, isValidFilePath } from '@/lib/constants';

const REPOS_BASE = env.GIT_REPOS_PATH || '/tmp/paperforge-repos';

function getRepoPath(projectId: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    throw new ApiError(400, 'Invalid project ID');
  }
  return path.join(REPOS_BASE, projectId);
}

export async function initProjectRepo(projectId: string) {
  const dir = getRepoPath(projectId);
  await fs.promises.mkdir(dir, { recursive: true });
  await git.init({ fs, dir });
  return dir;
}

type StoredFile = {
  id: string;
  path: string;
  isBinary: boolean;
  content: string | null;
  minioKey: string | null;
};

/**
 * Resolve the bytes for a project file, preferring the DB content column and
 * falling back to MinIO. Binary files store content base64-encoded so the same
 * column can serve both kinds.
 */
async function readFileBytes(file: StoredFile): Promise<Buffer | null> {
  if (file.content !== null) {
    return file.isBinary
      ? Buffer.from(file.content, 'base64')
      : Buffer.from(file.content, 'utf-8');
  }
  if (file.minioKey) {
    try {
      const stream = await minioClient.getObject(getBucket(), file.minioKey);
      const chunks: Buffer[] = [];
      for await (const chunk of stream as AsyncIterable<Buffer>) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch {
      return null;
    }
  }
  return null;
}

export async function commitProjectFiles(
  projectId: string,
  _userId: string,
  message: string,
) {
  const dir = getRepoPath(projectId);

  // Ensure repo is initialised
  try {
    await git.resolveRef({ fs, dir, ref: 'HEAD' });
  } catch {
    await initProjectRepo(projectId);
  }

  const files = await prisma.file.findMany({
    where: { projectId, deletedAt: null },
    select: { id: true, path: true, isBinary: true, content: true, minioKey: true },
  });

  const repoBase = path.resolve(dir) + path.sep;

  for (const file of files) {
    const resolved = path.resolve(path.join(dir, file.path));

    // Prevent directory traversal — resolved path must stay inside repo dir.
    // isValidFilePath already runs at the route boundary; this is defense in
    // depth in case a legacy / imported file slipped through.
    if (!resolved.startsWith(repoBase)) {
      console.error(`[version-service] Path traversal blocked: ${file.path}`);
      continue;
    }

    const bytes = await readFileBytes(file);
    if (bytes === null) {
      // Snapshot would otherwise have written empty bytes for this path,
      // silently corrupting the version. Skipping keeps the version honest.
      console.warn(`[version-service] Skipping file with unreadable content: ${file.path}`);
      continue;
    }

    await fs.promises.mkdir(path.dirname(resolved), { recursive: true });
    await fs.promises.writeFile(resolved, bytes);
    await git.add({ fs, dir, filepath: file.path });
  }

  const sha = await git.commit({
    fs,
    dir,
    message,
    author: { name: 'PaperForge', email: 'auto@paperforge.dev' },
  });

  return sha;
}

export async function createVersion(
  projectId: string,
  userId: string,
  label?: string,
) {
  const sha = await commitProjectFiles(
    projectId,
    userId,
    label || 'Auto-save',
  );

  return prisma.version.create({
    data: { projectId, userId, label, gitHash: sha },
  });
}

export async function listVersions(projectId: string) {
  return prisma.version.findMany({
    where: { projectId },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getVersionDiff(projectId: string, versionId: string) {
  const version = await prisma.version.findUnique({ where: { id: versionId } });
  if (!version) throw new ApiError(404, 'Version not found');
  if (version.projectId !== projectId) throw new ApiError(404, 'Version not found');

  const dir = getRepoPath(projectId);

  // Retrieve the commit log starting at this version's hash (depth 2 to show parent)
  const log = await git.log({ fs, dir, ref: version.gitHash, depth: 2 });

  return {
    version,
    commits: log.map((c) => ({
      oid: c.oid,
      message: c.commit.message,
      author: c.commit.author.name,
      timestamp: new Date(c.commit.author.timestamp * 1000),
    })),
  };
}

type SnapshotEntry = { path: string; bytes: Buffer };

/** Walk the git tree at `treeOid` and collect every blob path + bytes. */
async function collectTreeBlobs(
  dir: string,
  treeOid: string,
  prefix: string,
  out: SnapshotEntry[],
): Promise<void> {
  const tree = await git.readTree({ fs, dir, oid: treeOid });
  for (const entry of tree.tree) {
    const fullPath = prefix ? `${prefix}/${entry.path}` : entry.path;
    if (entry.type === 'tree') {
      await collectTreeBlobs(dir, entry.oid, fullPath, out);
    } else if (entry.type === 'blob') {
      const blob = await git.readBlob({ fs, dir, oid: entry.oid });
      out.push({ path: fullPath, bytes: Buffer.from(blob.blob) });
    }
  }
}

/**
 * Restore the project to the file set captured in `versionId`. Walks the git
 * tree, upserts every blob back into the DB, and soft-deletes any files that
 * exist now but were not in that snapshot. Refuses to restore from a snapshot
 * whose total content is empty — older versions created before this fix
 * captured no content and applying them would silently wipe the project.
 */
export async function restoreVersion(projectId: string, versionId: string, actorId?: string) {
  const version = await prisma.version.findUnique({ where: { id: versionId } });
  if (!version) throw new ApiError(404, 'Version not found');
  if (version.projectId !== projectId) throw new ApiError(404, 'Version not found');

  const dir = getRepoPath(projectId);

  const commit = await git.readCommit({ fs, dir, oid: version.gitHash });
  const entries: SnapshotEntry[] = [];
  await collectTreeBlobs(dir, commit.commit.tree, '', entries);

  const totalBytes = entries.reduce((sum, e) => sum + e.bytes.length, 0);
  if (entries.length === 0 || totalBytes === 0) {
    throw new ApiError(
      409,
      'This snapshot has no recoverable content (likely created before version capture was fixed) and cannot be restored.',
      'EMPTY_SNAPSHOT',
    );
  }

  if (entries.length > LIMITS.MAX_COMPILATION_FILES || totalBytes > LIMITS.MAX_PROJECT_SIZE
    || entries.some((entry) => !isValidFilePath(entry.path) || entry.bytes.length > LIMITS.MAX_FILE_SIZE)) {
    throw new ApiError(413, 'Version exceeds document limits', 'VERSION_TOO_LARGE');
  }
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId }, select: { revision: true },
  });
  const current = await prisma.file.findMany({
    where: { projectId, deletedAt: null }, select: { path: true },
  });
  const restoredPaths = new Set(entries.map((entry) => entry.path));
  const mutations: TextMutation[] = [];
  const cleanup: Array<() => Promise<void>> = [];
  try {
    for (const entry of entries) {
      if (looksBinary(entry.bytes)) {
        const staged = await stageBinaryBlob(projectId, entry.bytes);
        cleanup.push(staged.cleanup);
        mutations.push({ kind: 'upsertBinary', path: entry.path,
          sizeBytes: entry.bytes.length, mimeType: 'application/octet-stream',
          minioKey: staged.minioKey, content: staged.dbContent });
      } else {
        mutations.push({ kind: 'upsertText', path: entry.path,
          content: entry.bytes.toString('utf-8') });
      }
    }
    for (const file of current) {
      if (!restoredPaths.has(file.path)) mutations.push({ kind: 'delete', path: file.path });
    }
    await applyDocumentMutations({ projectId, mutations, actorId,
      expectedRevision: project.revision, allowTypeConversion: true });
  } catch (error) {
    await Promise.all(cleanup.map((remove) => remove()));
    throw error;
  }

  return version;
}

/**
 * Heuristic: presence of a NUL byte in the first 8KB marks the blob as
 * binary. Mirrors how git itself classifies files for diff purposes.
 */
function looksBinary(bytes: Buffer): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, 8192));
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) return true;
  }
  return false;
}

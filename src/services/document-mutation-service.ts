import crypto from 'crypto';
import { ApiError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@/generated/prisma/client/client';
import { isValidFilePath, LIMITS } from '@/lib/constants';

/**
 * PR-1 unified document mutation core (review R03, R04, R06).
 *
 * Every live document write — text, binary reference, delete, rename, restore,
 * template seed and import — flows through {@link applyDocumentMutations}. The single
 * transaction guarantees four things that used to be separate (and racy):
 *
 *  1. **Version precondition** – each mutation may declare the SHA-256 it
 *     expects (strong compare against current DB content) or '*' ("file must
 *     exist") or null ("file must not exist"). The check runs under a row lock
 *     inside the same transaction as the write, so two concurrent PUTs based on
 *     the same version cannot both succeed: the loser sees the winner's bytes
 *     and gets 409/412 instead of last-writer-wins.
 *  2. **Project revision bump** – every commit increments `project.revision`
 *     in the same transaction (R03). The changeset CAS on `baseRevision`
 *     becomes a true conflict check for external clients.
 *  3. **Atomic idempotency** – an `Idempotency-Key` is claimed (INSERT … ON
 *     CONFLICT DO NOTHING) inside the transaction, so a concurrent duplicate
 *     request replays the first response instead of executing the write twice
 *     (R06). Recording *after* the business operation, as before, let a retry
 *     race ahead of the first response.
 *  4. **Single authority** – text content lands in PostgreSQL; binary references
 *     point to immutable objects staged before the transaction.
 *  5. **Quota and audit** – owner usage is checked and refreshed, then the audit
 *     record is inserted in the same transaction as the file and revision.
 *
 * The service is deliberately free of HTTP concerns: this file must not import
 * snapshot/changeset/file services (all of which may import it) — only crypto,
 * errors, prisma and the generated client types.
 */

export type TextMutation =
  | { kind: 'upsertText'; path: string; content: string }
  | { kind: 'upsertBinary'; path: string; minioKey: string | null; content: string | null; sizeBytes: number; mimeType: string }
  | { kind: 'delete'; path: string }
  /**
   * Atomic file rename (review N02 / PR-A): validates the source version and
   * the absence of the destination under a row lock, then moves the row's
   * path — the fileId, content and object-store references all stay put. The
   * old "PUT new path then DELETE old path" client flow is banned precisely
   * because its second step runs even when the first one failed.
   */
  | { kind: 'rename'; from: string; to: string }
  /**
   * Atomic folder rename: every active file under `fromPrefix + '/'` moves to
   * `toPrefix + '/'…` in ONE transaction. Either the whole folder moves or
   * nothing does. `project.mainFile` is rewritten in the same commit.
   */
  | { kind: 'renamePrefix'; fromPrefix: string; toPrefix: string };

export type AppliedMutationFile = { id: string; path: string; sha256?: string };

export type ApplyDocumentMutationsParams = {
  projectId: string;
  mutations: TextMutation[];
  /**
   * Per-file content precondition, keyed by path:
   *  - `'<sha256>'` → file must exist with exactly this content hash
   *  - `'*'`       → file must exist (any content)
   *  - `null`      → file must NOT exist (create-only)
   * Paths absent from this map have no precondition.
   */
  expectedSha256ByPath?: Record<string, string | null>;
  /** CAS on project.revision; 409 when the project has moved. */
  expectedRevision?: string | bigint;
  /**
   * Legacy option retained only for source compatibility. Passing false is
   * rejected: every committed write must advance the revision.
   */
  bumpRevision?: boolean;
  actorId?: string;
  /** Explicit restore-only binary → text conversion; ordinary text saves forbid it. */
  allowTypeConversion?: boolean;
  /** Idempotency claim reserved atomically with the write. */
  idempotency?: {
    principal: string;
    operation: string;
    idempotencyKey: string;
    requestHash: string;
  };
};

export type AppliedDocumentMutations = {
  /** Revision after the mutation (previous + 1). */
  revision: bigint;
  files: AppliedMutationFile[];
  replayed: boolean;
  replayResponse?: object;
};

function sha256Text(content: string): string {
  return crypto.createHash('sha256').update(Buffer.from(content, 'utf-8')).digest('hex');
}

function toBigInt(value: string | bigint): bigint {
  try {
    return typeof value === 'bigint' ? value : BigInt(value);
  } catch {
    throw new ApiError(400, `Invalid revision value: ${String(value)}`, 'INVALID_REVISION');
  }
}

/** Is the error a Prisma unique-constraint violation (P2002)? */
function isUniqueViolation(error: unknown): boolean {
  return (
    !!error && typeof error === 'object'
    && (error as { code?: string }).code === 'P2002'
  );
}

/** Lock the active file row (or null when absent) so the precondition checks
 * and the write are serialised across concurrent requests for the same path. */
async function lockActiveFile(
  tx: Prisma.TransactionClient,
  projectId: string,
  path: string,
): Promise<{ id: string; deletedAt: Date | null; sizeBytes: bigint } | null> {
  const rows = await tx.$queryRaw<
    Array<{ id: string; deleted_at: Date | null; size_bytes: bigint }>
  >`
    SELECT id, deleted_at, size_bytes
    FROM files
    WHERE project_id = ${projectId}::uuid AND path = ${path} AND deleted_at IS NULL
    FOR UPDATE
  `;
  if (rows.length === 0) return null;
  return {
    id: rows[0].id,
    deletedAt: rows[0].deleted_at,
    sizeBytes: rows[0].size_bytes,
  };
}

/**
 * Strong-compare a locked row's content against the expected hash.
 *
 * An empty string is a LEGAL text body (review N04): `!row.content` used to
 * make a freshly-emptied file indistinguishable from a missing one, so saving
 * `""` with the correct SHA-256 of "" was rejected with 412. The three states
 * are now explicit:
 *   - row missing        → 412 (caller expected the file to exist)
 *   - row.content null  → 412 CONTENT_NOT_MIGRATED (legacy row whose text
 *                          still lives only in object storage — never coerce
 *                          to "", that would let a caller fabricate a baseline)
 *   - hash mismatch     → 412 (file changed since it was read)
 */
function assertContentHash(
  row: { content: string | null } | null,
  expected: string,
): void {
  if (!row) {
    throw new ApiError(412, 'File does not exist', 'PRECONDITION_FAILED');
  }
  if (row.content === null) {
    throw new ApiError(
      412,
      'File content has not been migrated to the database yet; re-read it before conditional writes',
      'CONTENT_NOT_MIGRATED',
    );
  }
  if (sha256Text(row.content) !== expected) {
    throw new ApiError(412, 'File has changed since it was read', 'PRECONDITION_FAILED');
  }
}

/** Newest soft-deleted row for a path, so we can revive it instead of piling
 * up tombstones (preserves the pre-PR-1 reuse behaviour). */
async function findDeletedForRevive(
  tx: Prisma.TransactionClient,
  projectId: string,
  path: string,
): Promise<{ id: string } | null> {
  return tx.file.findFirst({
    where: { projectId, path, deletedAt: { not: null } },
    orderBy: { deletedAt: 'desc' },
    select: { id: true },
  });
}

async function readRevision(
  tx: Prisma.TransactionClient,
  projectId: string,
): Promise<bigint> {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: { revision: true },
  });
  if (!project) throw new ApiError(404, 'Project not found', 'NOT_FOUND');
  return project.revision;
}

const MAX_MUTATIONS = 1000;

function isCanonicalFilePath(path: string): boolean {
  return isValidFilePath(path) && path.split('/').every((part) => part !== '' && part !== '.');
}

function validateMutations(projectId: string, mutations: TextMutation[]): void {
  if (mutations.length === 0 || mutations.length > MAX_MUTATIONS) {
    throw new ApiError(400, 'Invalid number of document mutations', 'INVALID_MUTATIONS');
  }
  let totalBytes = 0;
  for (const mutation of mutations) {
    const paths = mutation.kind === 'rename'
      ? [mutation.from, mutation.to]
      : mutation.kind === 'renamePrefix'
        ? [mutation.fromPrefix, mutation.toPrefix]
        : [mutation.path];
    if (paths.some((path) => !isCanonicalFilePath(path))) {
      throw new ApiError(400, 'Invalid file path', 'INVALID_PATH');
    }
    const bytes = mutation.kind === 'upsertText'
      ? Buffer.byteLength(mutation.content, 'utf-8')
      : mutation.kind === 'upsertBinary' ? mutation.sizeBytes : 0;
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > LIMITS.MAX_FILE_SIZE) {
      throw new ApiError(413, 'File exceeds the maximum size', 'FILE_TOO_LARGE');
    }
    if (mutation.kind === 'upsertBinary') {
      if (!mutation.minioKey?.startsWith(`projects/${projectId}/blobs/`)
        || !mutation.mimeType || mutation.mimeType.length > 255
        || (mutation.content !== null
          && Buffer.from(mutation.content, 'base64').length !== mutation.sizeBytes)) {
        throw new ApiError(400, 'Invalid binary object reference', 'INVALID_BINARY');
      }
    }
    totalBytes += bytes;
    if (totalBytes > LIMITS.MAX_PROJECT_SIZE) {
      throw new ApiError(413, 'Mutation batch exceeds the project size limit', 'PROJECT_TOO_LARGE');
    }
  }
}

/** Serialize writes across all projects owned by the same user. */
async function lockOwner(tx: Prisma.TransactionClient, projectId: string): Promise<{
  id: string; quota: bigint;
} | null> {
  const rows = await tx.$queryRaw<Array<{ id: string; storage_quota_bytes: bigint }>>`
    SELECT u.id, u.storage_quota_bytes FROM users u
    JOIN project_members pm ON pm.user_id = u.id
    WHERE pm.project_id = ${projectId}::uuid AND pm.role = 'owner'
    FOR UPDATE OF u
  `;
  return rows[0] ? { id: rows[0].id, quota: rows[0].storage_quota_bytes } : null;
}

async function enforceAndSyncQuota(
  tx: Prisma.TransactionClient,
  owner: { id: string; quota: bigint } | null,
  projectId: string,
  before: { projectBytes: bigint; ownerBytes: bigint },
): Promise<void> {
  const projectSize = await tx.file.aggregate({
    where: { projectId, deletedAt: null }, _sum: { sizeBytes: true },
  });
  const projectBytes = projectSize._sum.sizeBytes ?? BigInt(0);
  if (projectBytes > BigInt(LIMITS.MAX_PROJECT_SIZE) && projectBytes > before.projectBytes) {
    throw new ApiError(413, 'Project exceeds the size limit', 'PROJECT_TOO_LARGE');
  }
  if (!owner) throw new ApiError(409, 'Project has no storage owner', 'OWNER_REQUIRED');
  const used = await tx.file.aggregate({
    where: { deletedAt: null, project: { deletedAt: null,
      members: { some: { userId: owner.id, role: 'owner' } } } },
    _sum: { sizeBytes: true },
  });
  const bytes = used._sum.sizeBytes ?? BigInt(0);
  if (bytes > owner.quota && bytes > before.ownerBytes) {
    throw new ApiError(413, 'Storage quota exceeded', 'STORAGE_QUOTA_EXCEEDED');
  }
  await tx.user.update({ where: { id: owner.id }, data: { storageUsedBytes: bytes } });
}

/** Replay a previously stored idempotency record, or null when the key is free. */
export function validateIdempotency(params: NonNullable<ApplyDocumentMutationsParams['idempotency']>): void {
  if (!params.idempotencyKey || params.idempotencyKey.length > 255
    || /[\x00-\x1f\x7f]/.test(params.idempotencyKey)
    || !/^[0-9a-f]{64}$/.test(params.requestHash)) {
    throw new ApiError(400, 'Invalid Idempotency-Key or request hash', 'INVALID_IDEMPOTENCY');
  }
}

export async function claimIdempotency(
  tx: Prisma.TransactionClient,
  projectId: string,
  params: NonNullable<ApplyDocumentMutationsParams['idempotency']>,
): Promise<
  { replayed: true; response: object } | { replayed: false }
> {
  validateIdempotency(params);
  // INSERT … ON CONFLICT DO NOTHING reserves the key atomically.
  const created = await tx.idempotencyRecord.createMany({
    data: [
      {
        principal: params.principal,
        projectId,
        operation: params.operation,
        idempotencyKey: params.idempotencyKey,
        requestHash: params.requestHash,
        response: {},
        statusCode: 200,
      },
    ],
    skipDuplicates: true,
  });

  if (created.count === 1) return { replayed: false };

  const existing = await tx.idempotencyRecord.findUnique({
    where: {
      principal_projectId_operation_idempotencyKey: {
        principal: params.principal,
        projectId,
        operation: params.operation,
        idempotencyKey: params.idempotencyKey,
      },
    },
  });
  if (!existing) return { replayed: false };
  if (existing.requestHash !== params.requestHash) {
    throw new ApiError(
      409,
      'This Idempotency-Key was already used with a different request body',
      'IDEMPOTENCY_KEY_REUSED',
    );
  }
  return { replayed: true, response: existing.response as object };
}

export async function persistIdempotencyResponse(
  tx: Prisma.TransactionClient,
  projectId: string,
  params: NonNullable<ApplyDocumentMutationsParams['idempotency']>,
  response: object,
): Promise<void> {
  await tx.idempotencyRecord.updateMany({
    where: {
      principal: params.principal,
      projectId,
      operation: params.operation,
      idempotencyKey: params.idempotencyKey,
    },
    data: { response, statusCode: 200 },
  });
}

/**
 * Atomic single-file rename (review N02 / PR-A).
 *
 * One transaction: source version check (when an expected hash is supplied)
 * → destination-absence check → path update → mainFile follow-up. The fileId,
 * text content and binary object references (`minioKey`) are preserved — the
 * storage key is opaque and stays attached to the row, so no object is copied
 * or rewritten mid-transaction. Any failure leaves the file exactly where it
 * was.
 */
async function renameFileInTx(
  tx: Prisma.TransactionClient,
  projectId: string,
  mutation: { from: string; to: string },
  params: ApplyDocumentMutationsParams,
): Promise<AppliedMutationFile> {
  const { from, to } = mutation;
  if (from === to) {
    throw new ApiError(400, 'Rename source and destination are identical', 'INVALID_RENAME');
  }

  const source = await lockActiveFile(tx, projectId, from);
  if (!source) throw new ApiError(404, 'File not found', 'NOT_FOUND');

  const expected = params.expectedSha256ByPath?.[from];
  if (expected !== undefined && expected !== '*' && expected !== null) {
    const row = await tx.file.findUnique({
      where: { id: source.id },
      select: { content: true },
    });
    assertContentHash(row, expected);
  }

  const target = await lockActiveFile(tx, projectId, to);
  if (target) {
    throw new ApiError(
      409,
      'A file already exists at the destination path',
      'TARGET_EXISTS',
    );
  }

  await tx.file.update({ where: { id: source.id }, data: { path: to } });

  // Keep the project's main document in step, same commit.
  await tx.project.updateMany({
    where: { id: projectId, mainFile: from },
    data: { mainFile: to },
  });

  const row = await tx.file.findUnique({
    where: { id: source.id },
    select: { content: true },
  });
  return {
    id: source.id,
    path: to,
    ...(row?.content !== null && row?.content !== undefined
      ? { sha256: sha256Text(row.content) }
      : {}),
  };
}

/**
 * Atomic folder rename (review N02 / PR-A): every active file under
 * `fromPrefix + '/'` moves to the equivalent path under `toPrefix` in the
 * same transaction, with the same revision bump. A destination conflict on
 * ANY file aborts the whole move — a half-renamed folder must never exist.
 */
async function renamePrefixInTx(
  tx: Prisma.TransactionClient,
  projectId: string,
  mutation: { fromPrefix: string; toPrefix: string },
  params: ApplyDocumentMutationsParams,
): Promise<AppliedMutationFile[]> {
  const { fromPrefix, toPrefix } = mutation;
  if (fromPrefix === toPrefix) {
    throw new ApiError(400, 'Rename source and destination are identical', 'INVALID_RENAME');
  }
  if (toPrefix === fromPrefix || toPrefix.startsWith(`${fromPrefix}/`)) {
    throw new ApiError(400, 'Cannot move a folder inside itself', 'INVALID_RENAME');
  }

  // Lock every active file under the prefix so a concurrent writer cannot
  // slip a change in between the version checks and the path updates.
  const rows = await tx.$queryRaw<
    Array<{ id: string; path: string; content: string | null }>
  >`
    SELECT id, path, content
    FROM files
    WHERE project_id = ${projectId}::uuid
      AND path LIKE ${`${fromPrefix}/%`}
      AND deleted_at IS NULL
    FOR UPDATE
  `;
  if (rows.length === 0) {
    throw new ApiError(404, 'Folder not found (no files under it)', 'NOT_FOUND');
  }
  if (rows.length > LIMITS.MAX_COMPILATION_FILES) {
    throw new ApiError(413, 'Folder contains too many files', 'TOO_MANY_FILES');
  }

  const result: AppliedMutationFile[] = [];
  for (const row of rows) {
    const destPath = `${toPrefix}${row.path.slice(fromPrefix.length)}`;
    if (!isCanonicalFilePath(destPath)) {
      throw new ApiError(400, 'Invalid destination path', 'INVALID_PATH');
    }

    // Per-file version precondition (when the caller supplied one).
    const expected = params.expectedSha256ByPath?.[row.path];
    if (expected !== undefined && expected !== '*' && expected !== null) {
      assertContentHash({ content: row.content }, expected);
    }

    // Destination must be free — checked under the same row-lock regime.
    const target = await lockActiveFile(tx, projectId, destPath);
    if (target) {
      throw new ApiError(
        409,
        `A file already exists at "${destPath}"; the folder was not renamed`,
        'TARGET_EXISTS',
      );
    }

    await tx.file.update({ where: { id: row.id }, data: { path: destPath } });
    result.push({
      id: row.id,
      path: destPath,
      ...(row.content !== null ? { sha256: sha256Text(row.content) } : {}),
    });
  }

  // Follow the main document into the renamed folder, same commit.
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: { mainFile: true },
  });
  if (project?.mainFile && project.mainFile.startsWith(`${fromPrefix}/`)) {
    const newMain = `${toPrefix}${project.mainFile.slice(fromPrefix.length)}`;
    await tx.project.update({ where: { id: projectId }, data: { mainFile: newMain } });
  }

  return result;
}

/**
 * Core mutation. Runs inside `tx`; callers that want a single self-contained
 * transaction use {@link applyDocumentMutations}.
 */
export async function applyDocumentMutationsInTx(
  tx: Prisma.TransactionClient,
  params: ApplyDocumentMutationsParams,
): Promise<AppliedDocumentMutations> {
  const { projectId, mutations, expectedRevision, bumpRevision = true } = params;
  validateMutations(projectId, mutations);
  if (!bumpRevision) {
    throw new ApiError(400, 'Revision bypass is disabled', 'REVISION_BYPASS_DISABLED');
  }

  // 1. Idempotency claim (atomic: reserved before any write, rolled back with it).
  //    A replay must SHORT-CIRCUIT here: continuing on would bump the revision
  //    and re-apply the mutations, which is exactly the double-execution R06
  //    set out to prevent. The stored response is authoritative.
  if (params.idempotency) {
    const claimed = await claimIdempotency(tx, projectId, params.idempotency);
    if (claimed.replayed) {
      const stored = claimed.response as { revision?: string; files?: AppliedMutationFile[] };
      return {
        // The recorded response carries the revision of the original commit;
        // fall back to the project's current revision for records written
        // before the response was persisted.
        revision: stored.revision !== undefined
          ? toBigInt(stored.revision)
          : await readRevision(tx, projectId),
        files: stored.files ?? [],
        replayed: true,
        replayResponse: claimed.response,
      };
    }
  }

  const owner = await lockOwner(tx, projectId);
  const projectState = await tx.project.findUnique({
    where: { id: projectId }, select: { deletedAt: true },
  });
  if (!projectState || projectState.deletedAt) {
    throw new ApiError(404, 'Project not found', 'NOT_FOUND');
  }
  const preProject = await tx.file.aggregate({
    where: { projectId, deletedAt: null }, _sum: { sizeBytes: true },
  });
  const preOwner = owner ? await tx.file.aggregate({
      where: { deletedAt: null, project: { deletedAt: null,
        members: { some: { userId: owner.id, role: 'owner' } } } },
      _sum: { sizeBytes: true },
    }) : null;
  const before = {
    projectBytes: preProject._sum.sizeBytes ?? BigInt(0),
    ownerBytes: preOwner?._sum.sizeBytes ?? BigInt(0),
  };

  // 2. Revision CAS (project-level conflict detection).
  let newRevision: bigint;
  if (expectedRevision !== undefined) {
    const expected = toBigInt(expectedRevision);
    const claimed = await tx.project.updateMany({
      where: { id: projectId, revision: expected },
      data: { revision: { increment: BigInt(1) } },
    });
    if (claimed.count === 0) {
      const current = await readRevision(tx, projectId);
      throw new ApiError(
        409,
        `Project has moved to revision ${current} since it was read (expected ${expected}). Re-read and retry.`,
        'REVISION_CONFLICT',
      );
    }
    newRevision = expected + BigInt(1);
  } else if (bumpRevision) {
    const project = await tx.project.update({
      where: { id: projectId },
      data: { revision: { increment: BigInt(1) } },
    });
    newRevision = project.revision;
  } else {
    newRevision = await readRevision(tx, projectId);
  }

  // 3. Per-file conditional mutation.
  const files: AppliedMutationFile[] = [];
  for (const mutation of mutations) {
    if (mutation.kind === 'rename') {
      files.push(await renameFileInTx(tx, projectId, mutation, params));
      continue;
    }
    if (mutation.kind === 'renamePrefix') {
      files.push(...(await renamePrefixInTx(tx, projectId, mutation, params)));
      continue;
    }
    if (mutation.kind === 'delete') {
      const existing = await lockActiveFile(tx, projectId, mutation.path);
      if (!existing) {
        throw new ApiError(404, 'File not found', 'NOT_FOUND');
      }
      const expected = params.expectedSha256ByPath?.[mutation.path];
      if (expected && expected !== '*') {
        const row = await tx.file.findUnique({
          where: { id: existing.id },
          select: { content: true },
        });
        // N04: an empty string is a legal body — only a missing row or an
        // unmigrated null content fails this check, never sha256("").
        assertContentHash(row, expected);
      }
      await tx.file.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });
      continue;
    }

    // Upsert text or an already-staged immutable binary object.
    const { path } = mutation;
    const expected = params.expectedSha256ByPath?.[path];
    const locked = await lockActiveFile(tx, projectId, path);

    if (expected === null) {
      // Create-only: the path must currently be absent.
      if (locked) {
        throw new ApiError(412, 'File already exists', 'PRECONDITION_FAILED');
      }
    } else if (expected !== undefined && expected !== '*') {
      // Strong compare against the locked row's current content. N04: an
      // empty string is a legal body — assertContentHash distinguishes
      // missing / unmigrated null / hash mismatch explicitly.
      if (!locked) {
        throw new ApiError(412, 'File does not exist', 'PRECONDITION_FAILED');
      }
      const row = await tx.file.findUnique({
        where: { id: locked.id },
        select: { content: true, isBinary: true },
      });
      if (row?.isBinary) throw new ApiError(409, 'Binary files require a project revision precondition', 'BINARY_PRECONDITION');
      assertContentHash(row, expected);
    } else if (expected === '*' && !locked) {
      throw new ApiError(412, 'File does not exist', 'PRECONDITION_FAILED');
    }

    if (locked && mutation.kind === 'upsertText') {
      const current = await tx.file.findUnique({ where: { id: locked.id }, select: { isBinary: true } });
      if (current?.isBinary && !params.allowTypeConversion) {
        throw new ApiError(409, 'Cannot replace a binary file with text', 'FILE_TYPE_CONFLICT');
      }
    }
    const bytes = mutation.kind === 'upsertText'
      ? Buffer.byteLength(mutation.content, 'utf-8') : mutation.sizeBytes;
    const mimeType = mutation.kind === 'upsertText' ? detectTextMimeType(path) : mutation.mimeType;
    const fileData = mutation.kind === 'upsertText'
      ? { content: mutation.content, sizeBytes: BigInt(bytes), isBinary: false, mimeType, minioKey: null }
      : { content: mutation.content, sizeBytes: BigInt(bytes), isBinary: true, mimeType, minioKey: mutation.minioKey };

    let rowId: string;
    if (locked) {
      await tx.file.update({
        where: { id: locked.id },
        data: fileData,
      });
      rowId = locked.id;
    } else {
      const revived = await findDeletedForRevive(tx, projectId, path);
      if (revived) {
        await tx.file.update({
          where: { id: revived.id },
          data: {
            ...fileData,
            deletedAt: null,
          },
        });
        rowId = revived.id;
      } else {
        try {
          const created = await tx.file.create({
            data: {
              projectId,
              path,
              ...fileData,
            },
            select: { id: true },
          });
          rowId = created.id;
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw new ApiError(409, 'File was created concurrently; re-read and retry', 'VERSION_CONFLICT');
          }
          throw error;
        }
      }
    }

    files.push({ id: rowId, path, ...(mutation.kind === 'upsertText'
      ? { sha256: sha256Text(mutation.content) } : {}) });
  }

  await enforceAndSyncQuota(tx, owner, projectId, before);
  await tx.auditLog.create({ data: {
    adminId: params.actorId ?? null,
    action: 'document.mutated', targetType: 'project', targetId: projectId,
    details: { revision: newRevision.toString(), mutations: mutations.map((m) =>
      m.kind === 'rename' ? { kind: m.kind, from: m.from, to: m.to }
        : m.kind === 'renamePrefix'
          ? { kind: m.kind, from: m.fromPrefix, to: m.toPrefix }
          : { kind: m.kind, path: m.path }) },
  } });

  // 4. Persist the idempotency response only after the write succeeded.
  if (params.idempotency) {
    // BigInt is not JSON-serialisable for Prisma Json columns — store the
    // revision as its decimal string, same as the API surface.
    const response = {
      revision: newRevision.toString(),
      files: files.map((f) => ({ id: f.id, path: f.path, sha256: f.sha256 })),
    } as unknown as object;
    await persistIdempotencyResponse(tx, projectId, params.idempotency, response);
  }

  return {
    revision: newRevision,
    files,
    replayed: false,
    replayResponse: undefined,
  };
}

/** Self-contained transactional write; see {@link applyDocumentMutationsInTx}. */
export async function applyDocumentMutations(
  params: ApplyDocumentMutationsParams,
): Promise<AppliedDocumentMutations> {
  return prisma.$transaction((tx) => applyDocumentMutationsInTx(tx, params));
}

function detectTextMimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'tex':
    case 'ltx':
    case 'cls':
    case 'sty':
      return 'text/x-tex';
    case 'bib':
    case 'bst':
      return 'text/x-bibtex';
    case 'md':
      return 'text/markdown';
    case 'json':
      return 'application/json';
    case 'yaml':
    case 'yml':
      return 'text/yaml';
    default:
      return 'text/plain';
  }
}

import { prisma } from '@/lib/prisma';
import crypto from 'node:crypto';
import type { Prisma } from '@/generated/prisma/client/client';
import { env } from '@/lib/env';
import { isValidFilePath, LIMITS } from '@/lib/constants';
import { ApiError } from '@/lib/errors';
import { sha256Text } from '@/services/file-service';
import {
  createSnapshot,
  computeBuildFingerprint,
  computeInputHash,
  getSnapshot,
  manifestOf,
  parseRevision,
  readSnapshotFile,
  revisionToString,
  type SnapshotFileEntry,
  type SnapshotManifest,
} from '@/services/snapshot-service';
import {
  applyDocumentMutationsInTx,
  claimIdempotency,
  persistIdempotencyResponse,
  validateIdempotency,
  type TextMutation,
} from '@/services/document-mutation-service';
import type { Principal } from '@/services/api-token-service';

/**
 * Changesets: the write path for external automation.
 *
 * The contract is deliberately conservative:
 *
 *  - Edits are exact `oldText` → `newText` replacements against a known base
 *    snapshot. No fuzzy matching: an edit that cannot be located exactly is a
 *    conflict, never a guess.
 *  - Creating a changeset does not touch the live document. It is compiled and
 *    reviewed first, then applied only if the project has not moved.
 *  - Apply is all-or-nothing across every file in one database transaction, so
 *    a `.tex` change and its matching `.bib` change cannot half-land.
 */

export type Operation =
  | {
      op: 'edit_text';
      fileId: string;
      expectedSha256: string;
      edits: Array<{ oldText: string; newText: string; expectedOccurrences?: number }>;
    }
  | { op: 'replace_file'; fileId: string; expectedSha256: string; content: string }
  | { op: 'create_file'; path: string; content: string }
  | { op: 'delete_file'; fileId: string; expectedSha256: string };

export interface FileDiff {
  fileId: string | null;
  path: string;
  op: string;
  before: string | null;
  after: string | null;
  beforeSha256: string | null;
  afterSha256: string | null;
}

/** Candidate file set produced by applying operations to a base snapshot. */
interface CandidateResult {
  /** path → resulting content; null means the file is deleted. */
  files: Map<string, { fileId: string | null; content: string | null }>;
  diffs: FileDiff[];
  manifest: SnapshotManifest;
  sourceHash: string;
}

function changeSetBusinessResponse(row: {
  id: string; status: string; baseSnapshotId: string; baseRevision: bigint;
  resultHash: string | null; diff: unknown; createdAt: Date;
  message: string | null; revertsId: string | null;
}) {
  return { changeSetId: row.id, status: row.status,
    baseSnapshotId: row.baseSnapshotId, baseRevision: row.baseRevision.toString(),
    resultHash: row.resultHash, diff: row.diff, createdAt: row.createdAt.toISOString(),
    message: row.message, revertsId: row.revertsId };
}

function replayChangeSetRow<T extends { status: string; baseRevision: bigint;
  resultHash: string | null; diff: unknown; createdAt: Date }>(row: T,
  response: { status: string; baseRevision: string; resultHash: string | null;
    diff: unknown; createdAt: string }): T & { replayed: true } {
  return { ...row, status: response.status, baseRevision: BigInt(response.baseRevision),
    resultHash: response.resultHash, diff: response.diff,
    createdAt: new Date(response.createdAt), replayed: true };
}

async function storeCandidateSnapshot(
  tx: Prisma.TransactionClient,
  changeSetId: string,
  baseSnapshotId: string,
  candidate: CandidateResult,
): Promise<void> {
  const baseFiles = await tx.snapshotFile.findMany({ where: { snapshotId: baseSnapshotId } });
  const byPath = new Map(baseFiles.map((file) => [file.path, file]));
  const frozen = candidate.manifest.files.map((entry) => {
    const changed = candidate.files.get(entry.path);
    if (changed) {
      if (changed.content === null) throw new Error('Deleted file remains in candidate manifest');
      return { fileId: changed.fileId, path: entry.path, sha256: entry.sha256,
        sizeBytes: BigInt(entry.sizeBytes), isBinary: false,
        mimeType: byPath.get(entry.path)?.mimeType ?? 'text/plain',
        textContent: changed.content, binaryContent: null, blobKey: null };
    }
    const base = byPath.get(entry.path);
    if (!base) throw new Error(`Base snapshot file missing: ${entry.path}`);
    return { fileId: base.fileId, path: base.path, sha256: base.sha256,
      sizeBytes: base.sizeBytes, isBinary: base.isBinary,
      mimeType: base.mimeType, textContent: base.textContent,
      binaryContent: base.binaryContent, blobKey: base.blobKey };
  });
  const stored = await tx.candidateSnapshot.create({ data: {
    changeSetId, baseSnapshotId,
    manifest: candidate.manifest as unknown as object,
    sourceHash: candidate.sourceHash,
    buildFingerprint: computeBuildFingerprint(candidate.sourceHash, env.TEX_RUNTIME_FINGERPRINT),
  } });
  await tx.candidateSnapshotFile.createMany({ data: frozen.map((file) => ({
    ...file, candidateSnapshotId: stored.id,
  })) });
}

/** Count non-overlapping occurrences of `needle` in `haystack`. */
function countOccurrences(haystack: string, needle: string): number {
  if (needle === '') return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

/**
 * Apply one file's edits.
 *
 * Every edit is located against the *original* text and validated before any
 * replacement happens, then all replacements are performed left-to-right on
 * non-overlapping ranges. Applying edits one at a time to progressively
 * modified text would let an earlier edit change what a later one matches —
 * the classic way a patch tool corrupts a document while reporting success.
 */
export function applyEdits(
  original: string,
  edits: Array<{ oldText: string; newText: string; expectedOccurrences?: number }>,
  path: string,
): string {
  interface Range { start: number; end: number; replacement: string }
  const ranges: Range[] = [];

  for (const edit of edits) {
    if (typeof edit.oldText !== 'string' || typeof edit.newText !== 'string') {
      throw new ApiError(400, `Edit in "${path}" must have string oldText and newText`);
    }
    if (edit.oldText === '') {
      throw new ApiError(400, `Edit in "${path}" has an empty oldText; use create_file instead`);
    }

    const occurrences = countOccurrences(original, edit.oldText);
    const expected = edit.expectedOccurrences ?? 1;

    if (occurrences === 0) {
      throw new ApiError(
        409,
        `Text not found in "${path}": ${JSON.stringify(edit.oldText.slice(0, 80))}`,
        'EDIT_NOT_FOUND',
      );
    }
    if (occurrences !== expected) {
      // Ambiguity is a conflict, not a licence to pick the first hit.
      throw new ApiError(
        409,
        `Expected ${expected} occurrence(s) of the target text in "${path}" but found ${occurrences}. `
          + 'Include more surrounding context to make the match unique.',
        'EDIT_AMBIGUOUS',
      );
    }

    let from = 0;
    for (let i = 0; i < occurrences; i += 1) {
      const start = original.indexOf(edit.oldText, from);
      ranges.push({ start, end: start + edit.oldText.length, replacement: edit.newText });
      from = start + edit.oldText.length;
    }
  }

  ranges.sort((a, b) => a.start - b.start);
  for (let i = 1; i < ranges.length; i += 1) {
    if (ranges[i].start < ranges[i - 1].end) {
      throw new ApiError(
        409,
        `Overlapping edits in "${path}". Combine them into a single edit.`,
        'EDIT_OVERLAP',
      );
    }
  }

  let result = '';
  let cursor = 0;
  for (const range of ranges) {
    result += original.slice(cursor, range.start) + range.replacement;
    cursor = range.end;
  }
  return result + original.slice(cursor);
}

/** Validate a client-supplied operations array. */
export function validateOperations(raw: unknown): Operation[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 1000) {
    throw new ApiError(400, 'operations must contain between 1 and 1000 entries');
  }

  return raw.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new ApiError(400, `operations[${index}] must be an object`);
    }
    const op = entry as Record<string, unknown>;

    switch (op.op) {
      case 'edit_text':
        if (typeof op.fileId !== 'string' || typeof op.expectedSha256 !== 'string') {
          throw new ApiError(400, `operations[${index}] requires fileId and expectedSha256`);
        }
        if (!Array.isArray(op.edits) || op.edits.length === 0) {
          throw new ApiError(400, `operations[${index}].edits must be a non-empty array`);
        }
        return entry as Operation;

      case 'replace_file':
        if (typeof op.fileId !== 'string' || typeof op.expectedSha256 !== 'string') {
          throw new ApiError(400, `operations[${index}] requires fileId and expectedSha256`);
        }
        if (typeof op.content !== 'string') {
          throw new ApiError(400, `operations[${index}].content must be a string`);
        }
        return entry as Operation;

      case 'create_file':
        if (typeof op.path !== 'string' || typeof op.content !== 'string') {
          throw new ApiError(400, `operations[${index}] requires path and content strings`);
        }
        if (!isValidFilePath(op.path)
          || op.path.split('/').some((segment) => segment === '' || segment === '.')) {
          throw new ApiError(400, `operations[${index}].path is invalid`, 'INVALID_PATH');
        }
        return entry as Operation;

      case 'delete_file':
        if (typeof op.fileId !== 'string' || typeof op.expectedSha256 !== 'string') {
          throw new ApiError(400, `operations[${index}] requires fileId and expectedSha256`);
        }
        return entry as Operation;

      default:
        throw new ApiError(400, `operations[${index}].op is not a supported operation`);
    }
  });
}

/**
 * Compute the candidate file set without touching the live document.
 *
 * Each operation is checked against the base snapshot's recorded hash first, so
 * an AI working from stale content is rejected before anything is computed.
 */
async function computeCandidate(
  projectId: string,
  snapshotId: string,
  operations: Operation[],
): Promise<CandidateResult> {
  const snapshot = await getSnapshot(projectId, snapshotId);
  if (snapshot.sourceHash === null) {
    throw new ApiError(410, 'Legacy snapshot has no frozen bytes', 'LEGACY_SNAPSHOT_UNRECOVERABLE');
  }
  const manifest = manifestOf(snapshot);
  const byId = new Map<string, SnapshotFileEntry>(manifest.files.map((f) => [f.fileId, f]));
  const byPath = new Map<string, SnapshotFileEntry>(manifest.files.map((f) => [f.path, f]));

  const files: CandidateResult['files'] = new Map();

  /** Current candidate text for a file, honouring earlier operations. */
  const currentText = async (entry: SnapshotFileEntry): Promise<string> => {
    const pending = files.get(entry.path);
    if (pending) {
      if (pending.content === null) {
        throw new ApiError(409, `File "${entry.path}" was deleted earlier in this changeset`);
      }
      return pending.content;
    }
    return (await readSnapshotFile(projectId, snapshotId, entry.fileId)).content;
  };

  for (const operation of operations) {
    switch (operation.op) {
      case 'edit_text':
      case 'replace_file':
      case 'delete_file': {
        const entry = byId.get(operation.fileId);
        if (!entry) {
          throw new ApiError(404, `File ${operation.fileId} is not part of snapshot ${snapshotId}`);
        }
        if (entry.isBinary) {
          throw new ApiError(400, `File "${entry.path}" is binary and cannot be edited as text`);
        }
        // The snapshot itself is the version check: if the caller's expected
        // hash disagrees with what the snapshot recorded, they are working from
        // content the server never had at this revision.
        if (operation.expectedSha256 !== entry.sha256) {
          throw new ApiError(
            409,
            `Hash mismatch for "${entry.path}": expected ${operation.expectedSha256}, `
              + `snapshot has ${entry.sha256}. Re-read the file.`,
            'HASH_MISMATCH',
          );
        }

        const before = await currentText(entry);

        if (operation.op === 'delete_file') {
          files.set(entry.path, { fileId: entry.fileId, content: null });
          break;
        }

        const after =
          operation.op === 'edit_text'
            ? applyEdits(before, operation.edits, entry.path)
            : operation.content;

        files.set(entry.path, { fileId: entry.fileId, content: after });
        break;
      }

      case 'create_file': {
        if (byPath.has(operation.path) && !files.has(operation.path)) {
          throw new ApiError(409, `File "${operation.path}" already exists; use replace_file`);
        }
        files.set(operation.path, {
          fileId: byPath.get(operation.path)?.fileId ?? crypto.randomUUID(),
          content: operation.content,
        });
        break;
      }
    }
  }

  const diffs: FileDiff[] = [];
  for (const [path, result] of [...files]) {
    const base = byPath.get(path);
    const before = base && !base.isBinary
      ? (await readSnapshotFile(projectId, snapshotId, base.fileId)).content : null;
    if (before === result.content) {
      files.delete(path);
      continue;
    }
    diffs.push({ fileId: base?.fileId ?? null, path,
      op: before === null ? 'create_file'
        : result.content === null ? 'delete_file' : 'replace_file',
      before, after: result.content,
      beforeSha256: before === null ? null : sha256Text(before),
      afterSha256: result.content === null ? null : sha256Text(result.content),
    });
  }
  const fullFiles = new Map(manifest.files.map((entry) => [entry.path, entry]));
  for (const [path, result] of files) {
    if (result.content === null) fullFiles.delete(path);
    else fullFiles.set(path, {
      fileId: result.fileId ?? crypto.randomUUID(), path, sha256: sha256Text(result.content),
      sizeBytes: Buffer.byteLength(result.content, 'utf-8'),
      isBinary: false, minioKey: null,
    });
  }
  const candidateManifest: SnapshotManifest = {
    files: [...fullFiles.values()], mainFile: manifest.mainFile, compiler: manifest.compiler,
  };
  if (candidateManifest.files.length > LIMITS.MAX_COMPILATION_FILES
    || candidateManifest.files.some((file) => file.sizeBytes > LIMITS.MAX_FILE_SIZE)
    || candidateManifest.files.reduce((total, file) => total + file.sizeBytes, 0) > LIMITS.MAX_PROJECT_SIZE) {
    throw new ApiError(413, 'Candidate exceeds file count or size limits', 'CANDIDATE_TOO_LARGE');
  }
  if (files.size === 0) throw new ApiError(400, 'Changeset has no net effect', 'NO_EFFECT');
  return { files, diffs, manifest: candidateManifest,
    sourceHash: computeInputHash(candidateManifest) };
}

export interface CreateChangeSetInput {
  projectId: string;
  principal: Principal;
  baseSnapshotId?: string;
  baseRevision?: string;
  message?: string;
  operations: unknown;
  idempotency?: { principal: string; operation: string; idempotencyKey: string; requestHash: string };
}

/**
 * Create a candidate changeset. The live document is not modified.
 */
export async function createChangeSet(input: CreateChangeSetInput) {
  if (input.idempotency) {
    validateIdempotency(input.idempotency);
    const existing = await prisma.idempotencyRecord.findUnique({ where: {
      principal_projectId_operation_idempotencyKey: {
        principal: input.idempotency.principal, projectId: input.projectId,
        operation: input.idempotency.operation,
        idempotencyKey: input.idempotency.idempotencyKey,
      },
    } });
    if (existing) {
      if (existing.requestHash !== input.idempotency.requestHash) {
        throw new ApiError(409, 'This Idempotency-Key was already used with a different request body', 'IDEMPOTENCY_KEY_REUSED');
      }
      const stored = existing.response as { changeSetId?: string; publicResponse?: ReturnType<typeof changeSetBusinessResponse> };
      if (!stored.changeSetId || !stored.publicResponse) throw new ApiError(503, 'Idempotency response is incomplete', 'IDEMPOTENCY_INCOMPLETE');
      return replayChangeSetRow(await getChangeSet(input.projectId, stored.changeSetId), stored.publicResponse);
    }
  }
  const operations = validateOperations(input.operations);

  const snapshot = input.baseSnapshotId
    ? await getSnapshot(input.projectId, input.baseSnapshotId)
    : await createSnapshot(input.projectId);

  // When the caller states a base revision, hold them to it up front rather
  // than letting them discover the mismatch only at apply time.
  if (input.baseRevision !== undefined) {
    const claimed = parseRevision(input.baseRevision);
    if (claimed !== snapshot.revision) {
      throw new ApiError(
        409,
        `baseRevision ${input.baseRevision} does not match snapshot revision `
          + `${revisionToString(snapshot.revision)}`,
        'REVISION_MISMATCH',
      );
    }
  }

  const candidate = await computeCandidate(input.projectId, snapshot.id, operations);

  return prisma.$transaction(async (tx) => {
    if (input.idempotency) {
      const claim = await claimIdempotency(tx, input.projectId, input.idempotency);
      if (claim.replayed) {
        const stored = claim.response as { changeSetId?: string; publicResponse?: ReturnType<typeof changeSetBusinessResponse> };
        if (!stored.changeSetId || !stored.publicResponse) throw new ApiError(503, 'Idempotency response is incomplete', 'IDEMPOTENCY_INCOMPLETE');
        const existing = await tx.changeSet.findFirst({ where: { id: stored.changeSetId, projectId: input.projectId } });
        if (!existing) throw new ApiError(503, 'Idempotency changeset is missing', 'IDEMPOTENCY_INCOMPLETE');
        return replayChangeSetRow(existing, stored.publicResponse);
      }
    }
    const changeSet = await tx.changeSet.create({ data: {
      projectId: input.projectId,
      baseSnapshotId: snapshot.id,
      baseRevision: snapshot.revision,
      status: 'pending',
      message: input.message?.slice(0, 2000) ?? null,
      operations: operations as unknown as object,
      diff: candidate.diffs as unknown as object,
      resultHash: candidate.sourceHash,
      actorUserId: input.principal.userId,
      actorTokenId: input.principal.kind === 'token' ? input.principal.tokenId : null,
    } });
    await storeCandidateSnapshot(tx, changeSet.id, snapshot.id, candidate);
    if (input.idempotency) {
      await persistIdempotencyResponse(tx, input.projectId, input.idempotency,
        { changeSetId: changeSet.id, publicResponse: changeSetBusinessResponse(changeSet) });
    }
    await tx.auditLog.create({ data: { adminId: input.principal.userId,
      action: 'changeset.created', targetType: 'project', targetId: input.projectId,
      details: { changeSetId: changeSet.id, sourceHash: candidate.sourceHash },
    } });
    return { ...changeSet, replayed: false };
  });
}

/** Read a changeset, scoped to its project. */
export async function getChangeSet(projectId: string, changeSetId: string) {
  const changeSet = await prisma.changeSet.findFirst({
    where: { id: changeSetId, projectId },
  });
  if (!changeSet) throw new ApiError(404, 'Changeset not found');
  return changeSet;
}

/**
 * Apply a changeset to the live document.
 *
 * Compare-and-set on the project revision: the update only lands if the project
 * is still exactly where the changeset was based. If someone else committed in
 * the meantime the caller gets a 409 and must re-read — the server never merges
 * silently, and never overwrites the newer text.
 *
 * Every file write, the revision bump and the idempotency record land in one
 * transaction (PR-1), so a multi-file change either lands completely or not at
 * all, and a retried request cannot double-apply (R06).
 */
export async function applyChangeSet(
  projectId: string,
  changeSetId: string,
  expectedRevision?: string,
  idempotency?: {
    principal: string;
    operation: string;
    idempotencyKey: string;
    requestHash: string;
  },
) {
  if (idempotency) validateIdempotency(idempotency);
  const changeSet = await getChangeSet(projectId, changeSetId);

  if (changeSet.appliedAt) {
    // R06: a network retry (same Idempotency-Key + same body) replays the exact
    // recorded response instead of a 409. A *different* request hitting an
    // already-applied changeset still gets the explicit conflict.
    if (idempotency) {
      const record = await prisma.idempotencyRecord.findUnique({
        where: {
          principal_projectId_operation_idempotencyKey: {
            principal: idempotency.principal,
            projectId,
            operation: idempotency.operation,
            idempotencyKey: idempotency.idempotencyKey,
          },
        },
      });
      if (record) {
        if (record.requestHash !== idempotency.requestHash) {
          throw new ApiError(
            409,
            'This Idempotency-Key was already used with a different request body',
            'IDEMPOTENCY_KEY_REUSED',
          );
        }
        return {
          changeSet,
          revision: (record.response as { revision?: string }).revision
            ?? (changeSet.appliedRevision !== null ? revisionToString(changeSet.appliedRevision) : '0'),
          replayed: true,
          replayResponse: record.response as object,
        };
      }
    }
    throw new ApiError(
      409,
      'This changeset has already been applied. Create a new one to make further edits.',
      'ALREADY_APPLIED',
    );
  }
  if (changeSet.status === 'reverted') {
    throw new ApiError(409, 'This changeset has been reverted', 'CHANGESET_REVERTED');
  }

  if (expectedRevision !== undefined) {
    const claimed = parseRevision(expectedRevision);
    if (claimed !== changeSet.baseRevision) {
      throw new ApiError(
        409,
        `Supplied baseRevision ${expectedRevision} does not match the changeset's base `
          + `${revisionToString(changeSet.baseRevision)}`,
        'REVISION_MISMATCH',
      );
    }
  }

  const frozen = await prisma.candidateSnapshot.findUnique({
    where: { changeSetId }, include: { files: true },
  });
  if (!frozen || frozen.baseSnapshotId !== changeSet.baseSnapshotId
    || frozen.sourceHash !== changeSet.resultHash) {
    throw new ApiError(410, 'This changeset has no verified frozen candidate', 'LEGACY_CANDIDATE_UNRECOVERABLE');
  }
  const diffs = changeSet.diff as unknown as FileDiff[];
  const frozenByPath = new Map(frozen.files.map((file) => [file.path, file]));
  const mutations: TextMutation[] = diffs.map((diff) => {
    if (diff.after === null) return { kind: 'delete', path: diff.path };
    const file = frozenByPath.get(diff.path);
    if (!file || file.isBinary || file.textContent === null
      || sha256Text(file.textContent) !== file.sha256
      || file.sha256 !== diff.afterSha256) {
      throw new ApiError(503, `Frozen candidate is incomplete: ${diff.path}`, 'CANDIDATE_INTEGRITY_FAILED');
    }
    return { kind: 'upsertText', path: diff.path, content: file.textContent };
  });

  return prisma.$transaction(async (tx) => {
    // Compare-and-set + file writes + revision bump all happen inside the
    // unified mutation core (PR-1). `updateMany` with the revision in the
    // predicate returns count 0 when another writer got there first, which is
    // the whole conflict check — a read-then-write would leave a race.
    const applied = await applyDocumentMutationsInTx(tx, {
      projectId,
      mutations,
      expectedRevision: changeSet.baseRevision,
      // The mutation core persists the authoritative response (revision + file
      // list) atomically with the write; a later retry replays exactly that.
      idempotency: idempotency ?? undefined,
    });

    const newRevision = applied.revision;

    if (applied.replayed) {
      const existing = await tx.changeSet.findUniqueOrThrow({ where: { id: changeSetId } });
      if (!existing.appliedAt || existing.appliedRevision === null) {
        throw new ApiError(503, 'Idempotency response has no applied changeset', 'IDEMPOTENCY_INCOMPLETE');
      }
      return { changeSet: existing, revision: revisionToString(existing.appliedRevision),
        replayed: true, replayResponse: applied.replayResponse };
    }

    const updated = await tx.changeSet.update({
      where: { id: changeSetId },
      data: {
        status: 'applied',
        appliedRevision: newRevision,
        appliedAt: new Date(),
      },
    });

    if (idempotency) {
      await persistIdempotencyResponse(tx, projectId, idempotency, {
        changeSetId, status: 'applied', revision: revisionToString(newRevision),
        appliedAt: updated.appliedAt?.toISOString(),
      });
    }
    await tx.auditLog.create({ data: { adminId: changeSet.actorUserId,
      action: 'changeset.applied', targetType: 'project', targetId: projectId,
      details: { changeSetId, revision: revisionToString(newRevision) },
    } });

    return {
      changeSet: updated,
      revision: revisionToString(newRevision),
      replayed: applied.replayed,
      replayResponse: applied.replayResponse,
    };
  });
}

/**
 * Build the inverse of an applied changeset as a *new* candidate.
 *
 * Undo is expressed as a forward change, reviewed and applied like any other,
 * so it cannot discard edits other people made afterwards. Resetting the
 * project to an earlier state would silently delete their work.
 */
export async function revertChangeSet(
  projectId: string,
  changeSetId: string,
  principal: Principal,
  idempotency?: { principal: string; operation: string; idempotencyKey: string; requestHash: string },
) {
  if (idempotency) {
    validateIdempotency(idempotency);
    const existing = await prisma.idempotencyRecord.findUnique({ where: {
      principal_projectId_operation_idempotencyKey: {
        principal: idempotency.principal, projectId,
        operation: idempotency.operation, idempotencyKey: idempotency.idempotencyKey,
      },
    } });
    if (existing) {
      if (existing.requestHash !== idempotency.requestHash) {
        throw new ApiError(409, 'This Idempotency-Key was already used with a different request body', 'IDEMPOTENCY_KEY_REUSED');
      }
      const stored = existing.response as { changeSetId?: string; publicResponse?: ReturnType<typeof changeSetBusinessResponse> };
      if (!stored.changeSetId || !stored.publicResponse) throw new ApiError(503, 'Idempotency response is incomplete', 'IDEMPOTENCY_INCOMPLETE');
      return replayChangeSetRow(await getChangeSet(projectId, stored.changeSetId), stored.publicResponse);
    }
  }
  const original = await getChangeSet(projectId, changeSetId);

  if (!original.appliedAt) {
    throw new ApiError(409, 'Cannot revert a changeset that was never applied');
  }

  const diffs = original.diff as unknown as FileDiff[] | null;
  if (!diffs || diffs.length === 0) {
    throw new ApiError(409, 'Changeset has no recorded diff to invert');
  }
  if (new Set(diffs.map((diff) => diff.path)).size !== diffs.length) {
    throw new ApiError(409,
      'Legacy changeset has multiple recorded edits for one file; automatic revert is unsafe',
      'REVERT_UNSAFE_LEGACY_DIFF');
  }

  const snapshot = await createSnapshot(projectId);
  const manifest = manifestOf(snapshot);
  const byPath = new Map(manifest.files.map((f) => [f.path, f]));

  const operations: Operation[] = [];

  for (const diff of diffs) {
    const current = byPath.get(diff.path);

    if (diff.op === 'create_file') {
      if (!current) continue; // Already gone; nothing to undo.
      // Only remove it if it still holds exactly what we created. If someone
      // has since edited the file, stop rather than delete their work.
      if (current.sha256 !== diff.afterSha256) {
        throw new ApiError(
          409,
          `"${diff.path}" has been edited since this changeset was applied. `
            + 'Resolve it manually rather than reverting automatically.',
          'REVERT_CONFLICT',
        );
      }
      operations.push({ op: 'delete_file', fileId: current.fileId, expectedSha256: current.sha256 });
      continue;
    }

    if (diff.op === 'delete_file') {
      if (current) {
        throw new ApiError(409, `"${diff.path}" already exists again; revert manually`, 'REVERT_CONFLICT');
      }
      operations.push({ op: 'create_file', path: diff.path, content: diff.before ?? '' });
      continue;
    }

    // edit_text / replace_file — restore the previous content, but only if the
    // file still matches what this changeset produced.
    if (!current) {
      throw new ApiError(409, `"${diff.path}" no longer exists; revert manually`, 'REVERT_CONFLICT');
    }
    if (current.sha256 !== diff.afterSha256) {
      throw new ApiError(
        409,
        `"${diff.path}" has changed since this changeset was applied. `
          + 'Reverting would discard those later edits.',
        'REVERT_CONFLICT',
      );
    }
    operations.push({
      op: 'replace_file',
      fileId: current.fileId,
      expectedSha256: current.sha256,
      content: diff.before ?? '',
    });
  }

  if (operations.length === 0) {
    throw new ApiError(409, 'Nothing to revert');
  }

  const candidate = await computeCandidate(projectId, snapshot.id, operations);

  return prisma.$transaction(async (tx) => {
    if (idempotency) {
      const claim = await claimIdempotency(tx, projectId, idempotency);
      if (claim.replayed) {
        const stored = claim.response as { changeSetId?: string; publicResponse?: ReturnType<typeof changeSetBusinessResponse> };
        if (!stored.changeSetId || !stored.publicResponse) throw new ApiError(503, 'Idempotency response is incomplete', 'IDEMPOTENCY_INCOMPLETE');
        const existing = await tx.changeSet.findFirst({ where: { id: stored.changeSetId, projectId } });
        if (!existing) throw new ApiError(503, 'Idempotency changeset is missing', 'IDEMPOTENCY_INCOMPLETE');
        return replayChangeSetRow(existing, stored.publicResponse);
      }
    }
    const changeSet = await tx.changeSet.create({ data: {
      projectId,
      baseSnapshotId: snapshot.id,
      baseRevision: snapshot.revision,
      status: 'pending',
      message: `Revert: ${original.message ?? original.id}`,
      operations: operations as unknown as object,
      diff: candidate.diffs as unknown as object,
      resultHash: candidate.sourceHash,
      revertsId: original.id,
      actorUserId: principal.userId,
      actorTokenId: principal.kind === 'token' ? principal.tokenId : null,
    } });
    await storeCandidateSnapshot(tx, changeSet.id, snapshot.id, candidate);
    if (idempotency) {
      await persistIdempotencyResponse(tx, projectId, idempotency,
        { changeSetId: changeSet.id, publicResponse: changeSetBusinessResponse(changeSet) });
    }
    await tx.auditLog.create({ data: { adminId: principal.userId,
      action: 'changeset.revert_created', targetType: 'project', targetId: projectId,
      details: { changeSetId: changeSet.id, revertsId: original.id },
    } });
    return { ...changeSet, replayed: false };
  });
}

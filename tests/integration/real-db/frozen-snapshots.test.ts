import { beforeEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { isTestInfraReady, getNotReadyReason, resetDatabase } from '../../helpers/test-infra';
import { fixtureProject, fixtureUser } from '../../helpers/fixtures';

if (!(await isTestInfraReady())) throw new Error(`Acceptance prerequisites not met: ${getNotReadyReason()}`);
if (process.env.RUN_DESTRUCTIVE_TESTS !== '1') throw new Error('RUN_DESTRUCTIVE_TESTS=1 is required.');

import { prisma } from '@/lib/prisma';
import { applyDocumentMutations } from '@/services/document-mutation-service';
import { uploadBinaryFile } from '@/services/file-service';
import { createSnapshot, readSnapshotFile, readSnapshotFileBytes } from '@/services/snapshot-service';
import { createChangeSet, applyChangeSet, revertChangeSet } from '@/services/changeset-service';
import { sha256Text } from '@/services/file-service';
import { triggerCompilation, requestCompilationCancel } from '@/services/compilation-service';
import { Queue } from 'bullmq';

describe('PR-D frozen snapshots', () => {
  let userId: string;
  let projectId: string;
  beforeEach(async () => {
    await resetDatabase();
    userId = (await fixtureUser()).id;
    projectId = (await fixtureProject(userId)).id;
  });

  it('reads old text and binary bytes after edits and deletion', async () => {
    const text = await applyDocumentMutations({ projectId,
      mutations: [{ kind: 'upsertText', path: 'main.tex', content: 'old text' }] });
    const binary = await uploadBinaryFile(projectId, 'figure.png', Buffer.from([0, 1, 2]), 'image/png');
    const snapshot = await createSnapshot(projectId);
    const same = await createSnapshot(projectId);
    expect(same.id).toBe(snapshot.id);
    expect(snapshot.sourceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshot.buildFingerprint).toBeNull();

    await uploadBinaryFile(projectId, 'figure.png', Buffer.from([0, 3, 4]), 'image/png');
    const imageChanged = await createSnapshot(projectId);
    expect(imageChanged.sourceHash).not.toBe(snapshot.sourceHash);
    expect((imageChanged.manifest as { files: Array<{ path: string; sha256: string }> }).files
      .find((file) => file.path === 'figure.png')?.sha256)
      .not.toBe((snapshot.manifest as { files: Array<{ path: string; sha256: string }> }).files
        .find((file) => file.path === 'figure.png')?.sha256);
    await applyDocumentMutations({ projectId,
      mutations: [{ kind: 'upsertText', path: 'main.tex', content: 'new text' }] });
    await applyDocumentMutations({ projectId,
      mutations: [{ kind: 'delete', path: 'main.tex' }] });

    expect((await readSnapshotFile(projectId, snapshot.id, text.files[0].id)).content).toBe('old text');
    expect((await readSnapshotFileBytes(projectId, snapshot.id, binary.id)).bytes)
      .toEqual(Buffer.from([0, 1, 2]));
    const next = await createSnapshot(projectId);
    expect(next.sourceHash).not.toBe(snapshot.sourceHash);
  });

  it('marks manifest-only legacy snapshots unrecoverable', async () => {
    const old = await prisma.sourceSnapshot.create({ data: {
      projectId, revision: BigInt(0), inputHash: '0'.repeat(64),
      mainFile: 'main.tex', compiler: 'pdflatex',
      manifest: { files: [{ fileId: crypto.randomUUID(), path: 'main.tex',
        sha256: '0'.repeat(64), sizeBytes: 1, isBinary: false, minioKey: null }],
        mainFile: 'main.tex', compiler: 'pdflatex' },
    } });
    await expect(readSnapshotFile(projectId, old.id, crypto.randomUUID()))
      .rejects.toMatchObject({ code: 'LEGACY_SNAPSHOT_UNRECOVERABLE' });
  });

  it('freezes a full candidate and replays create/apply without a second write', async () => {
    const first = await applyDocumentMutations({ projectId, mutations: [
      { kind: 'upsertText', path: 'main.tex', content: 'old' },
      { kind: 'upsertText', path: 'refs.bib', content: '@book{old}' },
    ] });
    const snapshot = await createSnapshot(projectId);
    const principal = { kind: 'user' as const, userId };
    const idempotency = { principal: `user:${userId}`, operation: 'changeset.create',
      idempotencyKey: 'create-1', requestHash: 'a'.repeat(64) };
    const input = { projectId, principal, baseSnapshotId: snapshot.id,
      operations: [
        { op: 'replace_file', fileId: first.files[0].id,
          expectedSha256: sha256Text('old'), content: 'new' },
        { op: 'create_file', path: 'appendix.tex', content: 'appendix' },
      ], idempotency };
    const [changeSet, duplicate] = await Promise.all([createChangeSet(input), createChangeSet(input)]);
    expect(duplicate.id).toBe(changeSet.id);
    expect([changeSet.replayed, duplicate.replayed].sort()).toEqual([false, true]);
    const candidate = await prisma.candidateSnapshot.findUniqueOrThrow({
      where: { changeSetId: changeSet.id }, include: { files: true },
    });
    expect(candidate.files.map((f) => f.path).sort()).toEqual(['appendix.tex', 'main.tex', 'refs.bib']);
    expect(candidate.files.find((f) => f.path === 'refs.bib')?.textContent).toBe('@book{old}');
    expect(candidate.files.find((f) => f.path === 'appendix.tex')?.fileId).toMatch(/^[0-9a-f-]{36}$/);

    const replayCreate = await createChangeSet(input);
    expect(replayCreate.id).toBe(changeSet.id);
    expect(replayCreate.replayed).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: 'changeset.created', targetId: projectId } }))
      .toBe(1);
    await expect(createChangeSet({ ...input, idempotency: { ...idempotency, requestHash: 'b'.repeat(64) } }))
      .rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });

    const applyKey = { principal: `user:${userId}`, operation: `changeset.apply:${changeSet.id}`,
      idempotencyKey: 'apply-1', requestHash: 'c'.repeat(64) };
    const applied = await applyChangeSet(projectId, changeSet.id, undefined, applyKey);
    expect(applied.replayed).toBe(false);
    expect(applied.revision).toBe((snapshot.revision + BigInt(1)).toString());
    const replay = await applyChangeSet(projectId, changeSet.id, undefined, applyKey);
    expect(replay.replayed).toBe(true);
    expect(replay.revision).toBe(applied.revision);
    expect(replay.changeSet.appliedAt?.toISOString()).toBe(applied.changeSet.appliedAt?.toISOString());
    expect(await prisma.auditLog.count({ where: { action: 'changeset.applied', targetId: projectId } }))
      .toBe(1);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).revision)
      .toBe(snapshot.revision + BigInt(1));
    const record = await prisma.idempotencyRecord.findUniqueOrThrow({ where: {
      principal_projectId_operation_idempotencyKey: { principal: applyKey.principal,
        projectId, operation: applyKey.operation, idempotencyKey: applyKey.idempotencyKey },
    } });
    expect(record.response).toMatchObject({ changeSetId: changeSet.id,
      revision: applied.revision, appliedAt: applied.changeSet.appliedAt?.toISOString() });
    const lateCreateReplay = await createChangeSet(input);
    expect(lateCreateReplay.status).toBe('pending');
    expect(lateCreateReplay.createdAt.toISOString()).toBe(changeSet.createdAt.toISOString());
  });

  it('records net diffs after repeated edits so revert restores the original', async () => {
    const first = await applyDocumentMutations({ projectId,
      mutations: [{ kind: 'upsertText', path: 'main.tex', content: 'A' }] });
    const snapshot = await createSnapshot(projectId);
    const principal = { kind: 'user' as const, userId };
    const changeSet = await createChangeSet({ projectId, principal,
      baseSnapshotId: snapshot.id, operations: [
        { op: 'replace_file', fileId: first.files[0].id, expectedSha256: sha256Text('A'), content: 'B' },
        { op: 'replace_file', fileId: first.files[0].id, expectedSha256: sha256Text('A'), content: 'C' },
      ] });
    expect(changeSet.diff).toMatchObject([{ before: 'A', after: 'C' }]);
    await applyChangeSet(projectId, changeSet.id);
    const revertKey = { principal: `user:${userId}`,
      operation: `changeset.revert:${changeSet.id}`,
      idempotencyKey: 'revert-1', requestHash: 'd'.repeat(64) };
    const [revert, revertDuplicate] = await Promise.all([
      revertChangeSet(projectId, changeSet.id, principal, revertKey),
      revertChangeSet(projectId, changeSet.id, principal, revertKey),
    ]);
    expect(revertDuplicate.id).toBe(revert.id);
    expect([revert.replayed, revertDuplicate.replayed].sort()).toEqual([false, true]);
    expect(await prisma.auditLog.count({ where: { action: 'changeset.revert_created', targetId: projectId } }))
      .toBe(1);
    await applyChangeSet(projectId, revert.id);
    const lateRevertReplay = await revertChangeSet(projectId, changeSet.id, principal, revertKey);
    expect(lateRevertReplay.status).toBe('pending');
    expect((await prisma.file.findFirstOrThrow({ where: { projectId, path: 'main.tex', deletedAt: null } })).content)
      .toBe('A');
  });

  it('dispatches live and candidate compiles by frozen identity only', async () => {
    const first = await applyDocumentMutations({ projectId,
      mutations: [{ kind: 'upsertText', path: 'main.tex', content: 'before' }] });
    const source = await createSnapshot(projectId);
    const candidate = await createChangeSet({ projectId,
      principal: { kind: 'user', userId }, baseSnapshotId: source.id,
      operations: [{ op: 'replace_file', fileId: first.files[0].id,
        expectedSha256: sha256Text('before'), content: 'candidate' }] });
    const liveJob = await triggerCompilation(projectId, userId);
    const compileKey = { principal: `user:${userId}`, operation: 'compile.trigger',
      idempotencyKey: 'compile-1', requestHash: 'e'.repeat(64) };
    const [candidateJob, candidateRetry] = await Promise.all([
      triggerCompilation(projectId, userId, candidate.id, compileKey),
      triggerCompilation(projectId, userId, candidate.id, compileKey),
    ]);
    expect(candidateRetry?.id).toBe(candidateJob?.id);
    expect([candidateJob?.replayed, candidateRetry?.replayed].sort()).toEqual([false, true]);
    expect({ ...candidateJob, replayed: undefined }).toEqual({ ...candidateRetry, replayed: undefined });
    expect(await prisma.auditLog.count({ where: { action: 'project.compiled', targetId: projectId } }))
      .toBe(2);
    expect(liveJob?.sourceSnapshotId).toBe(source.id);
    expect(liveJob?.sourceHash).toBe(source.sourceHash);
    expect(candidateJob?.candidateSnapshotId).toBeTruthy();
    expect(candidateJob?.sourceHash).toBe(candidate.resultHash);
    await applyDocumentMutations({ projectId,
      mutations: [{ kind: 'upsertText', path: 'main.tex', content: 'after' }] });
    const historicalJob = await triggerCompilation(projectId, userId, undefined, undefined, source.id);
    expect(historicalJob?.sourceSnapshotId).toBe(source.id);
    expect(historicalJob?.sourceHash).toBe(source.sourceHash);
    const queue = new Queue('compilation', { connection: { host: 'localhost', port: 6380 } });
    try {
      for (const job of [liveJob, candidateJob, historicalJob]) {
        const queued = await queue.getJob(job!.id);
        expect(queued?.data).toMatchObject({ compilationId: job!.id, projectId });
        expect(JSON.stringify(queued?.data)).not.toContain('before');
        expect(JSON.stringify(queued?.data)).not.toContain('candidate');
      }
      const cancelled = await requestCompilationCancel(projectId, candidateJob!.id, userId);
      expect(cancelled.status).toBe('cancelled');
      expect(await prisma.auditLog.count({ where: { action: 'compilation.cancel_requested', targetId: projectId } }))
        .toBe(1);
    } finally {
      for (const job of [liveJob, candidateJob, historicalJob]) {
        await (await queue.getJob(job!.id))?.remove();
      }
      await queue.close();
    }
  });
});

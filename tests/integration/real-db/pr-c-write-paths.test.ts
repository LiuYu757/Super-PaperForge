import { beforeEach, describe, expect, it } from 'vitest';
import { isTestInfraReady, getNotReadyReason, resetDatabase } from '../../helpers/test-infra';
import { fixtureProject, fixtureUser } from '../../helpers/fixtures';

if (!(await isTestInfraReady())) {
  throw new Error(`Acceptance prerequisites not met: ${getNotReadyReason()}`);
}
if (process.env.RUN_DESTRUCTIVE_TESTS !== '1') {
  throw new Error('RUN_DESTRUCTIVE_TESTS=1 is required for the acceptance suite.');
}

import { prisma } from '@/lib/prisma';
import { applyDocumentMutations } from '@/services/document-mutation-service';
import { getFileBuffer, uploadBinaryFile } from '@/services/file-service';
import { createProjectWithFiles, createProjectWithTextFiles, updateProject } from '@/services/project-service';
import { createVersion, restoreVersion } from '@/services/version-service';

describe('PR-C transactional input paths', () => {
  let userId: string;
  let projectId: string;

  beforeEach(async () => {
    await resetDatabase();
    const user = await fixtureUser();
    userId = user.id;
    projectId = (await fixtureProject(userId)).id;
  });

  it('rolls back file, revision, usage and audit together on quota failure; delete releases bytes', async () => {
    await prisma.user.update({ where: { id: userId },
      data: { storageQuotaBytes: BigInt(4) } });
    await applyDocumentMutations({ projectId,
      mutations: [{ kind: 'upsertText', path: 'main.tex', content: 'abcd' }] });
    const before = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    const auditCount = await prisma.auditLog.count({ where: { targetId: projectId } });
    await expect(applyDocumentMutations({ projectId,
      mutations: [{ kind: 'upsertText', path: 'main.tex', content: 'abcde' }] }))
      .rejects.toMatchObject({ code: 'STORAGE_QUOTA_EXCEEDED' });
    expect((await prisma.file.findFirstOrThrow({ where: { projectId, path: 'main.tex', deletedAt: null } })).content)
      .toBe('abcd');
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).revision).toBe(before.revision);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).storageUsedBytes).toBe(BigInt(4));
    expect(await prisma.auditLog.count({ where: { targetId: projectId } })).toBe(auditCount);
    await applyDocumentMutations({ projectId, mutations: [{ kind: 'delete', path: 'main.tex' }] });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).storageUsedBytes).toBe(BigInt(0));
  });

  it('serializes quota across two projects of the same owner', async () => {
    await prisma.user.update({ where: { id: userId },
      data: { storageQuotaBytes: BigInt(5) } });
    const otherId = (await fixtureProject(userId)).id;
    const results = await Promise.allSettled([projectId, otherId].map((id) =>
      applyDocumentMutations({ projectId: id,
        mutations: [{ kind: 'upsertText', path: 'main.tex', content: 'abc' }] })));
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).storageUsedBytes).toBe(BigInt(3));
  });

  it('allows deletions that reduce an already over-quota account', async () => {
    await applyDocumentMutations({ projectId, mutations: [
      { kind: 'upsertText', path: 'a.tex', content: 'abc' },
      { kind: 'upsertText', path: 'b.tex', content: 'def' },
    ] });
    await prisma.user.update({ where: { id: userId }, data: { storageQuotaBytes: BigInt(1) } });
    await applyDocumentMutations({ projectId, mutations: [{ kind: 'delete', path: 'a.tex' }] });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).storageUsedBytes).toBe(BigInt(3));
  });

  it('keeps replaced binary blobs immutable and advances revision', async () => {
    const first = await uploadBinaryFile(projectId, 'figure.png', Buffer.from([1, 2]), 'image/png');
    const second = await uploadBinaryFile(projectId, 'figure.png', Buffer.from([3, 4, 5]), 'image/png');
    expect(second.id).toBe(first.id);
    expect(second.minioKey).not.toBe(first.minioKey);
    expect(second.sizeBytes).toBe(BigInt(3));
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).revision).toBe(BigInt(2));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).storageUsedBytes).toBe(BigInt(3));
  });

  it('advances revision when compiler or main file changes so old candidates conflict', async () => {
    const base = (await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).revision;
    await updateProject(projectId, userId, { compiler: 'xelatex', mainFile: 'chapter.tex' });
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).revision)
      .toBe(base + BigInt(1));
    await expect(applyDocumentMutations({ projectId, expectedRevision: base,
      mutations: [{ kind: 'upsertText', path: 'chapter.tex', content: 'stale' }] }))
      .rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  });

  it('imports a new project and its text files in one quota-checked transaction', async () => {
    await prisma.user.update({ where: { id: userId },
      data: { storageQuotaBytes: BigInt(5) } });
    const before = await prisma.project.count({ where: { createdBy: userId } });
    await expect(createProjectWithTextFiles(userId, { name: 'too large' }, [
      { path: 'main.tex', content: 'abcdef' },
    ])).rejects.toMatchObject({ code: 'STORAGE_QUOTA_EXCEEDED' });
    expect(await prisma.project.count({ where: { createdBy: userId } })).toBe(before);
    const imported = await createProjectWithTextFiles(userId, { name: 'okay' }, [
      { path: 'main.tex', content: 'abc' },
      { path: 'references.bib', content: 'de' },
    ]);
    expect(imported.revision).toBe(BigInt(1));
    expect(await prisma.file.count({ where: { projectId: imported.id, deletedAt: null } })).toBe(2);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).storageUsedBytes).toBe(BigInt(5));
  });

  it('restores text and binary bytes in one revision while keeping old blobs immutable', async () => {
    await applyDocumentMutations({ projectId,
      mutations: [{ kind: 'upsertText', path: 'main.tex', content: 'version A' }] });
    await uploadBinaryFile(projectId, 'figure.png', Buffer.from([0, 1, 2]), 'image/png');
    const version = await createVersion(projectId, userId, 'A');
    await applyDocumentMutations({ projectId,
      mutations: [{ kind: 'upsertText', path: 'main.tex', content: 'version B' }] });
    const replaced = await uploadBinaryFile(projectId, 'figure.png', Buffer.from([0, 3, 4]), 'image/png');
    const before = (await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).revision;
    await restoreVersion(projectId, version.id, userId);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).revision)
      .toBe(before + BigInt(1));
    expect((await getFileBuffer(projectId, 'main.tex')).buffer.toString('utf-8')).toBe('version A');
    expect((await getFileBuffer(projectId, 'figure.png')).buffer).toEqual(Buffer.from([0, 1, 2]));
    const restored = await prisma.file.findFirstOrThrow({ where: { projectId, path: 'figure.png', deletedAt: null } });
    expect(restored.minioKey).not.toBe(replaced.minioKey);
  });

  it('creates a template-style project with text and binary in one revision', async () => {
    const project = await createProjectWithFiles(userId, { name: 'template copy' }, [
      { path: 'main.tex', content: '\\includegraphics{figure.png}' },
      { path: 'figure.png', bytes: Buffer.from([0, 7, 8]), mimeType: 'image/png' },
    ]);
    expect(project.revision).toBe(BigInt(1));
    expect((await getFileBuffer(project.id, 'figure.png')).buffer).toEqual(Buffer.from([0, 7, 8]));
    expect(await prisma.file.count({ where: { projectId: project.id, deletedAt: null } })).toBe(2);
  });
});

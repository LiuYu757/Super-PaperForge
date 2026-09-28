import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apply: vi.fn(), project: vi.fn(), file: vi.fn(),
  ensureBucket: vi.fn(), putObject: vi.fn(), removeObject: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: {
  project: { findUnique: mocks.project },
  file: { findUniqueOrThrow: mocks.file },
} }));
vi.mock('@/services/document-mutation-service', () => ({
  applyDocumentMutations: mocks.apply,
}));
vi.mock('@/lib/env', () => ({ env: { LOCAL_STORAGE_PATH: '', MINIO_ALLOW_FALLBACK: false } }));
vi.mock('@/lib/minio', () => ({
  ensureBucket: mocks.ensureBucket, getBucket: () => 'bucket',
  minioClient: { putObject: mocks.putObject, removeObject: mocks.removeObject },
}));

import { createFile, uploadBinaryFile } from '@/services/file-service';

describe('file-service writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.project.mockResolvedValue({ revision: BigInt(7), deletedAt: null });
    mocks.file.mockResolvedValue({ id: 'file-1' });
    mocks.apply.mockResolvedValue({ files: [{ id: 'file-1' }], revision: BigInt(8) });
    mocks.ensureBucket.mockResolvedValue(undefined);
    mocks.putObject.mockResolvedValue(undefined);
    mocks.removeObject.mockResolvedValue(undefined);
  });

  it('sends text through the transaction core', async () => {
    await createFile('project-1', 'main.tex', 'hello');
    expect(mocks.apply).toHaveBeenCalledWith({
      projectId: 'project-1',
      mutations: [{ kind: 'upsertText', path: 'main.tex', content: 'hello' }],
    });
  });

  it('stages unique binary bytes and commits them with a revision precondition', async () => {
    await uploadBinaryFile('project-1', 'figure.png', Buffer.from([1, 2]), 'image/png');
    expect(mocks.putObject).toHaveBeenCalledTimes(1);
    const key = mocks.putObject.mock.calls[0][1] as string;
    expect(key).toMatch(/^projects\/project-1\/blobs\/[0-9a-f-]{36}$/);
    expect(mocks.apply).toHaveBeenCalledWith({
      projectId: 'project-1', actorId: undefined, expectedRevision: BigInt(7),
      mutations: [{ kind: 'upsertBinary', path: 'figure.png',
        minioKey: key, content: null, sizeBytes: 2, mimeType: 'image/png' }],
    });
  });

  it('removes an orphaned staged object when the DB transaction fails', async () => {
    mocks.apply.mockRejectedValue(new Error('revision conflict'));
    await expect(uploadBinaryFile('project-1', 'figure.png', Buffer.from([1]), 'image/png'))
      .rejects.toThrow('revision conflict');
    expect(mocks.removeObject).toHaveBeenCalledWith('bucket', mocks.putObject.mock.calls[0][1]);
  });
});

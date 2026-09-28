/**
 * PR-A acceptance additions (reviews N02, N04): the empty-file lifecycle and
 * transactional rename, executed against the isolated real stack.
 *
 * N04 — an empty string is a legal text body. The pre-PR-A core used
 * `!row.content` and rejected `sha256("")`; the full lifecycle
 * (create empty → type → save → clear → save → retype → save → delete) must
 * work with the exact byte hash at every step.
 *
 * N02 — rename is ONE transaction: the fileId, content and object references
 * survive; a destination conflict leaves the source untouched; a folder
 * rename moves every file and follows project.mainFile, or nothing at all.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  isTestInfraReady,
  getNotReadyReason,
  resetDatabase,
  putTextToMinio,
  sha256Sync,
} from '../../helpers/test-infra';
import {
  fixtureUser,
  fixtureProject,
  fixtureTextFileDualStore,
  fixtureRevision,
  fixtureFileRow,
} from '../../helpers/fixtures';

const ready = await isTestInfraReady();
if (!ready) {
  throw new Error(
    `Acceptance prerequisites not met: ${getNotReadyReason()}. ` +
    'Start the isolated stack (./scripts/test-env.sh up && ./scripts/test-env.sh migrate) ' +
    'and export RUN_DESTRUCTIVE_TESTS=1 before npm run test:integration. ' +
    'Refusing to skip: a skipped acceptance case must never count as passed.',
  );
}
if (process.env.RUN_DESTRUCTIVE_TESTS !== '1') {
  throw new Error('RUN_DESTRUCTIVE_TESTS=1 is required for the acceptance suite.');
}

import { prisma } from '@/lib/prisma';
import { applyDocumentMutations } from '@/services/document-mutation-service';
import { getFileContent } from '@/services/file-service';

const EMPTY_SHA = sha256Sync('');

describe('N04 — the empty-file lifecycle (empty string is a legal body)', () => {
  let projectId: string;

  beforeAll(async () => {
    await resetDatabase();
  });
  beforeEach(async () => {
    await resetDatabase();
    const user = await fixtureUser();
    const project = await fixtureProject(user.id);
    projectId = project.id;
  });

  it('create empty → type → save → clear → save → retype → save → delete, all with exact hashes', async () => {
    // 1. Create an EMPTY file (create-only precondition).
    await applyDocumentMutations({
      projectId,
      mutations: [{ kind: 'upsertText', path: 'empty.tex', content: '' }],
      expectedSha256ByPath: { 'empty.tex': null },
    });
    expect(await getFileContent(projectId, 'empty.tex')).toBe('');

    // 2. Save an edit; then CLEAR the file and save the empty string with
    //    the correct hash of "" — the exact case that used to 412.
    await applyDocumentMutations({
      projectId,
      mutations: [{ kind: 'upsertText', path: 'empty.tex', content: '\\section{}' }],
      expectedSha256ByPath: { 'empty.tex': EMPTY_SHA },
    });
    await applyDocumentMutations({
      projectId,
      mutations: [{ kind: 'upsertText', path: 'empty.tex', content: '' }],
      expectedSha256ByPath: { 'empty.tex': sha256Sync('\\section{}') },
    });
    expect(await getFileContent(projectId, 'empty.tex')).toBe('');

    // 3. Re-type after the cleared save — the empty body is the new baseline.
    await applyDocumentMutations({
      projectId,
      mutations: [{ kind: 'upsertText', path: 'empty.tex', content: 'retyped' }],
      expectedSha256ByPath: { 'empty.tex': EMPTY_SHA },
    });
    expect(await getFileContent(projectId, 'empty.tex')).toBe('retyped');

    // 4. Delete an EMPTY file by its exact hash (also used to fail).
    await applyDocumentMutations({
      projectId,
      mutations: [{ kind: 'delete', path: 'empty.tex' }],
      expectedSha256ByPath: { 'empty.tex': sha256Sync('retyped') },
    });
    expect(await fixtureFileRow(projectId, 'empty.tex')).toBeNull();
  });

  it('a fresh empty file can be deleted by sha256("") immediately', async () => {
    await applyDocumentMutations({
      projectId,
      mutations: [{ kind: 'upsertText', path: 'gone.tex', content: '' }],
      expectedSha256ByPath: { 'gone.tex': null },
    });
    await applyDocumentMutations({
      projectId,
      mutations: [{ kind: 'delete', path: 'gone.tex' }],
      expectedSha256ByPath: { 'gone.tex': EMPTY_SHA },
    });
    expect(await fixtureFileRow(projectId, 'gone.tex')).toBeNull();
  });

  it('a legacy row whose content is null fails with CONTENT_NOT_MIGRATED, not a fake "" baseline', async () => {
    // Legacy state: text lives only in object storage; the DB column is null.
    await prisma.file.create({
      data: {
        projectId,
        path: 'legacy.tex',
        isBinary: false,
        sizeBytes: BigInt(2),
        mimeType: 'text/x-tex',
        minioKey: `projects/${projectId}/files/legacy.tex`,
        content: null,
      },
    });
    await putTextToMinio(`projects/${projectId}/files/legacy.tex`, 'legacy-object-body');

    // A conditional write against this row must NOT treat null as "" — that
    // would fabricate a baseline for bytes the caller never saw.
    await expect(
      applyDocumentMutations({
        projectId,
        mutations: [{ kind: 'upsertText', path: 'legacy.tex', content: 'overwrite' }],
        expectedSha256ByPath: { 'legacy.tex': EMPTY_SHA },
      }),
    ).rejects.toMatchObject({ statusCode: 412, code: 'CONTENT_NOT_MIGRATED' });
    // Neither may a delete with a guessed hash succeed.
    await expect(
      applyDocumentMutations({
        projectId,
        mutations: [{ kind: 'delete', path: 'legacy.tex' }],
        expectedSha256ByPath: { 'legacy.tex': EMPTY_SHA },
      }),
    ).rejects.toMatchObject({ statusCode: 412, code: 'CONTENT_NOT_MIGRATED' });
    expect(await fixtureFileRow(projectId, 'legacy.tex')).not.toBeNull();
  });
});

describe('N02 — atomic rename (single transaction, fileId preserved)', () => {
  let projectId: string;

  beforeAll(async () => {
    await resetDatabase();
  });
  beforeEach(async () => {
    await resetDatabase();
    const user = await fixtureUser();
    const project = await fixtureProject(user.id);
    projectId = project.id;
  });

  it('renames a text file: same fileId, same content, path moved, revision +1', async () => {
    const { file } = await fixtureTextFileDualStore(projectId, 'main.tex', 'body');
    const rev0 = await fixtureRevision(projectId);

    const applied = await applyDocumentMutations({
      projectId,
      mutations: [{ kind: 'rename', from: 'main.tex', to: 'renamed.tex' }],
    });
    expect(applied.files[0]?.id).toBe(file.id); // identity preserved
    expect(applied.files[0]?.path).toBe('renamed.tex');
    expect(await fixtureRevision(projectId)).toBe(rev0 + BigInt(1));

    const row = await fixtureFileRow(projectId, 'renamed.tex');
    expect(row?.id).toBe(file.id);
    expect(row?.content).toBe('body');
    expect(await fixtureFileRow(projectId, 'main.tex')).toBeNull();
  });

  it('renames a BINARY file keeping its object reference (no empty-text rebuild)', async () => {
    const file = await prisma.file.create({
      data: {
        projectId,
        path: 'figure.png',
        isBinary: true,
        sizeBytes: BigInt(4),
        mimeType: 'image/png',
        minioKey: `projects/${projectId}/files/figure.png`,
        content: null,
      },
      select: { id: true, minioKey: true },
    });
    await applyDocumentMutations({
      projectId,
      mutations: [{ kind: 'rename', from: 'figure.png', to: 'img/figure.png' }],
    });
    const row = await fixtureFileRow(projectId, 'img/figure.png');
    // The object key is unchanged — the stored bytes stay referenced; the
    // rename never rewrote the row as empty text.
    expect(row?.id).toBe(file.id);
    expect(row?.isBinary).toBe(true);
    expect(row?.minioKey).toBe(file.minioKey);
    expect(row?.content).toBeNull();
  });

  it('refuses a rename onto an occupied destination and leaves the source intact', async () => {
    const { file } = await fixtureTextFileDualStore(projectId, 'a.tex', 'A');
    await fixtureTextFileDualStore(projectId, 'b.tex', 'B');
    const rev0 = await fixtureRevision(projectId);

    await expect(
      applyDocumentMutations({
        projectId,
        mutations: [{ kind: 'rename', from: 'a.tex', to: 'b.tex' }],
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'TARGET_EXISTS' });

    // Nothing moved, nothing deleted — the entire "create new then delete
    // old" failure mode is structurally gone.
    expect((await fixtureFileRow(projectId, 'a.tex'))?.id).toBe(file.id);
    expect(await getFileContent(projectId, 'a.tex')).toBe('A');
    expect(await getFileContent(projectId, 'b.tex')).toBe('B');
    expect(await fixtureRevision(projectId)).toBe(rev0);
  });

  it('verifies the source hash when expectedSha256 is provided', async () => {
    await fixtureTextFileDualStore(projectId, 'main.tex', 'v1');
    await expect(
      applyDocumentMutations({
        projectId,
        mutations: [{ kind: 'rename', from: 'main.tex', to: 'moved.tex' }],
        expectedSha256ByPath: { 'main.tex': sha256Sync('stale-body') },
      }),
    ).rejects.toMatchObject({ statusCode: 412, code: 'PRECONDITION_FAILED' });
    expect(await fixtureFileRow(projectId, 'main.tex')).not.toBeNull();
    expect(await fixtureFileRow(projectId, 'moved.tex')).toBeNull();
  });

  it('folder rename moves every file in one commit and follows project.mainFile', async () => {
    await fixtureTextFileDualStore(projectId, 'sections/intro.tex', 'intro');
    await fixtureTextFileDualStore(projectId, 'sections/body/chapter1.tex', 'chapter1');
    await fixtureTextFileDualStore(projectId, 'other/keep.tex', 'keep');
    await prisma.project.update({
      where: { id: projectId },
      data: { mainFile: 'sections/intro.tex' },
    });
    const rev0 = await fixtureRevision(projectId);

    const applied = await applyDocumentMutations({
      projectId,
      mutations: [{ kind: 'renamePrefix', fromPrefix: 'sections', toPrefix: 'chapters' }],
    });
    const moved = applied.files.map((f) => f.path).sort();
    expect(moved).toEqual(['chapters/body/chapter1.tex', 'chapters/intro.tex']);
    // ONE revision bump for the whole folder, not one per file.
    expect(await fixtureRevision(projectId)).toBe(rev0 + BigInt(1));

    expect(await getFileContent(projectId, 'chapters/intro.tex')).toBe('intro');
    expect(await getFileContent(projectId, 'chapters/body/chapter1.tex')).toBe('chapter1');
    expect(await fixtureFileRow(projectId, 'sections/intro.tex')).toBeNull();
    expect(await fixtureFileRow(projectId, 'other/keep.tex')).not.toBeNull();
    // mainFile followed into the renamed folder, same transaction.
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(project.mainFile).toBe('chapters/intro.tex');
  });

  it('a folder rename with ANY destination conflict aborts the whole move', async () => {
    await fixtureTextFileDualStore(projectId, 'sections/intro.tex', 'intro');
    await fixtureTextFileDualStore(projectId, 'sections/conclusion.tex', 'conclusion');
    await fixtureTextFileDualStore(projectId, 'chapters/intro.tex', 'occupied');
    const rev0 = await fixtureRevision(projectId);

    await expect(
      applyDocumentMutations({
        projectId,
        mutations: [{ kind: 'renamePrefix', fromPrefix: 'sections', toPrefix: 'chapters' }],
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'TARGET_EXISTS' });

    // Every source file is exactly where it was — no half-renamed folder.
    expect(await fixtureFileRow(projectId, 'sections/intro.tex')).not.toBeNull();
    expect(await fixtureFileRow(projectId, 'sections/conclusion.tex')).not.toBeNull();
    expect(await getFileContent(projectId, 'chapters/intro.tex')).toBe('occupied');
    expect(await fixtureRevision(projectId)).toBe(rev0);
  });

  it('refuses to move a folder inside itself', async () => {
    await fixtureTextFileDualStore(projectId, 'a/x.tex', 'x');
    await expect(
      applyDocumentMutations({
        projectId,
        mutations: [{ kind: 'renamePrefix', fromPrefix: 'a', toPrefix: 'a/b' }],
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_RENAME' });
    expect(await fixtureFileRow(projectId, 'a/x.tex')).not.toBeNull();
  });

  it('404s when renaming a missing file or an empty prefix', async () => {
    await expect(
      applyDocumentMutations({
        projectId,
        mutations: [{ kind: 'rename', from: 'ghost.tex', to: 'other.tex' }],
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      applyDocumentMutations({
        projectId,
        mutations: [{ kind: 'renamePrefix', fromPrefix: 'ghost', toPrefix: 'other' }],
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

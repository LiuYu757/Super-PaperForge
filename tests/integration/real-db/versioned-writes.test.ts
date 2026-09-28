/**
 * PR-0 acceptance baseline + PR-1 safeguards, executed against real
 * PostgreSQL / MinIO (docker-compose.test.yml). These cases failed against the
 * reviewed baseline (commit d292867) and must stay green after PR-1.
 *
 * Run `./scripts/test-env.sh up && npm run test:integration`.
 *
 * Cases map to review findings:
 *   R02  text reads must come from PostgreSQL (apply must not serve stale bytes)
 *   R03  every commit advances project.revision in the same transaction
 *   R04  conditional writes are atomic (concurrent same-hash PUTs serialise)
 *        + If-Match '*'/'create-only' semantics under one write path
 *   R05  revert/apply surface 409 instead of clobbering later edits
 *   R06  idempotency claim + business write + recorded response are one tx
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  isTestInfraReady,
  getNotReadyReason,
  resetDatabase,
  putTextToMinio,
  getTextFromMinio,
  sha256Sync,
} from '../../helpers/test-infra';
import {
  fixtureUser,
  fixtureProject,
  fixtureTextFileDualStore,
  fixtureRevision,
  fixtureFileRow,
} from '../../helpers/fixtures';

/**
 * Acceptance prerequisites are HARD requirements (review N01 / PR-A):
 * missing infrastructure must FAIL the run, never silently skip. The plain
 * `npm test` unit suite excludes this directory entirely; `test:integration`
 * is an explicit opt-in to destructive execution against the isolated stack
 * (docker-compose.test.yml) and therefore must not degrade to a green run
 * when its dependencies are absent.
 */
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
  throw new Error(
    'RUN_DESTRUCTIVE_TESTS=1 is required for the acceptance suite — it truncates the ' +
    'test database between cases. Refusing to run without the explicit opt-in.',
  );
}
const describeDb = describe;

import { applyDocumentMutations } from '@/services/document-mutation-service';
import { getFileContent, createFile, deleteFile, sha256Text } from '@/services/file-service';

describeDb('PR-1 unified mutation core against real PostgreSQL/MinIO', () => {
  let userId: string;
  let projectId: string;

  beforeAll(async () => {
    await resetDatabase();
    const user = await fixtureUser();
    userId = user.id;
  });

  beforeEach(async () => {
    await resetDatabase();
    const user = await fixtureUser();
    userId = user.id;
    const project = await fixtureProject(userId);
    projectId = project.id;
  });

  describe('R02 — PostgreSQL is the single authority for committed text', () => {
    it('serves the DB content even when the MinIO object diverges (the old dual-store bug)', async () => {
      const { file, minioKey, sha256 } = await fixtureTextFileDualStore(projectId, 'main.tex', 'v1');
      expect(sha256Text(await getFileContent(projectId, 'main.tex'))).toBe(sha256);

      // Simulate the pre-PR-1 divergence: a changeset applied only the DB
      // column while MinIO kept the old bytes, or an old writer updated the
      // object behind the row.
      await putTextToMinio(minioKey, 'STALE-OBJECT-BYTES');

      // Reads must follow the database, never the stale object.
      expect(await getFileContent(projectId, 'main.tex')).toBe('v1');
      expect(file.id).toBeDefined();
    });

    it('apply-style mutation updates the DB and leaves reads authoritative without touching MinIO', async () => {
      const { minioKey } = await fixtureTextFileDualStore(projectId, 'main.tex', 'v1');
      await applyDocumentMutations({
        projectId,
        mutations: [{ kind: 'upsertText', path: 'main.tex', content: 'v2-new' }],
      });

      // The mutation wrote PostgreSQL only.
      expect(await getFileContent(projectId, 'main.tex')).toBe('v2-new');
      // The old object is untouched (best-effort MinIO mirroring is banned by
      // the review; the object now simply lags and is no longer consulted).
      expect(await getTextFromMinio(minioKey)).toBe('v1');
    });
  });

  describe('R03 — every committed write advances project.revision', () => {
    it('bumps the revision for upsert, create and delete', async () => {
      // Fixtures write rows directly — they bypass the mutation core and so
      // leave the revision untouched. Only real writes may bump it.
      await fixtureTextFileDualStore(projectId, 'main.tex', 'a');
      const rev0 = await fixtureRevision(projectId);
      expect(rev0).toBe(BigInt(0));

      await createFile(projectId, 'notes.md', 'b');
      expect(await fixtureRevision(projectId)).toBe(rev0 + BigInt(1));

      await deleteFile(projectId, 'main.tex');
      expect(await fixtureRevision(projectId)).toBe(rev0 + BigInt(2));

      // A concurrent client that based its changeset on the initial revision is
      // now stale.
      await expect(
        applyDocumentMutations({
          projectId,
          mutations: [{ kind: 'upsertText', path: 'notes.md', content: 'c' }],
          expectedRevision: rev0,
        }),
      ).rejects.toMatchObject({ statusCode: 409, code: 'REVISION_CONFLICT' });
    });

    it('CAS on the current revision succeeds and advances by exactly one', async () => {
      const rev0 = await fixtureRevision(projectId);
      const applied = await applyDocumentMutations({
        projectId,
        mutations: [{ kind: 'upsertText', path: 'a.tex', content: 'x' }],
        expectedRevision: rev0,
      });
      expect(applied.revision).toBe(rev0 + BigInt(1));
      expect(await fixtureRevision(projectId)).toBe(rev0 + BigInt(1));
    });
  });

  describe('R04 — conditional writes are atomic, not read-then-write', () => {
    it('two concurrent PUTs based on the same hash: exactly one wins, one 412s', async () => {
      const { sha256 } = await fixtureTextFileDualStore(projectId, 'main.tex', 'v1');

      const attempt = (content: string) =>
        applyDocumentMutations({
          projectId,
          mutations: [{ kind: 'upsertText', path: 'main.tex', content }],
          expectedSha256ByPath: { 'main.tex': sha256 },
        });

      const [a, b] = await Promise.allSettled([attempt('edit-A'), attempt('edit-B')]);
      const ok = [a, b].filter((r) => r.status === 'fulfilled');
      const failed = [a, b].filter((r) => r.status === 'rejected');

      expect(ok).toHaveLength(1);
      expect(failed).toHaveLength(1);
      expect(['edit-A', 'edit-B']).toContain(await getFileContent(projectId, 'main.tex'));
      const winner = (ok[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof attempt>>>).value;
      expect(winner.files[0]?.path).toBe('main.tex');
    });

    it('If-Match "*" requires existence; expected:null is create-only', async () => {
      // '*' on a missing file → precondition failed.
      await expect(
        applyDocumentMutations({
          projectId,
          mutations: [{ kind: 'upsertText', path: 'ghost.tex', content: 'x' }],
          expectedSha256ByPath: { 'ghost.tex': '*' },
        }),
      ).rejects.toMatchObject({ statusCode: 412, code: 'PRECONDITION_FAILED' });

      // create-only on a missing file → created.
      const created = await applyDocumentMutations({
        projectId,
        mutations: [{ kind: 'upsertText', path: 'fresh.tex', content: 'x' }],
        expectedSha256ByPath: { 'fresh.tex': null },
      });
      expect(created.files).toHaveLength(1);

      // create-only on an existing file → precondition failed (If-None-Match *).
      await expect(
        applyDocumentMutations({
          projectId,
          mutations: [{ kind: 'upsertText', path: 'fresh.tex', content: 'y' }],
          expectedSha256ByPath: { 'fresh.tex': null },
        }),
      ).rejects.toMatchObject({ statusCode: 412, code: 'PRECONDITION_FAILED' });
    });

    it('a stale hash is rejected with 412 and the file is untouched', async () => {
      await fixtureTextFileDualStore(projectId, 'main.tex', 'v1');
      await expect(
        applyDocumentMutations({
          projectId,
          mutations: [{ kind: 'upsertText', path: 'main.tex', content: 'clobber' }],
          expectedSha256ByPath: { 'main.tex': sha256Sync('v1') + 'deadbeef' },
        }),
      ).rejects.toMatchObject({ statusCode: 412 });
      expect(await getFileContent(projectId, 'main.tex')).toBe('v1');
    });

    it('deletes verify the precondition too, and missing files 404', async () => {
      await fixtureTextFileDualStore(projectId, 'main.tex', 'v1');
      await expect(
        applyDocumentMutations({
          projectId,
          mutations: [{ kind: 'delete', path: 'main.tex' }],
          expectedSha256ByPath: { 'main.tex': sha256Sync('v2') },
        }),
      ).rejects.toMatchObject({ statusCode: 412 });
      expect(await fixtureFileRow(projectId, 'main.tex')).not.toBeNull();

      await applyDocumentMutations({
        projectId,
        mutations: [{ kind: 'delete', path: 'main.tex' }],
        expectedSha256ByPath: { 'main.tex': '*' },
      });
      expect(await fixtureFileRow(projectId, 'main.tex')).toBeNull();

      await expect(
        applyDocumentMutations({
          projectId,
          mutations: [{ kind: 'delete', path: 'main.tex' }],
          expectedSha256ByPath: { 'main.tex': '*' },
        }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('R06 — idempotency is claimed in the same transaction as the write', () => {
    const principal = 'user:test-principal';
    const operation = 'file.upsert';

    it('concurrent duplicates replay the first response and bump the revision once', async () => {
      const key = 'key-concurrent';
      const requestHash = sha256Sync('same-body');
      const attempt = () =>
        applyDocumentMutations({
          projectId,
          mutations: [{ kind: 'upsertText', path: 'idem.tex', content: 'once' }],
          idempotency: { principal, operation, idempotencyKey: key, requestHash },
        });

      const [a, b] = await Promise.allSettled([attempt(), attempt()]);
      const settled = [a, b];
      // Either both succeed (one as replay) or one throws a benign conflict;
      // what must NEVER happen is two executed writes.
      expect(settled.filter((r) => r.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);

      const content = await getFileContent(projectId, 'idem.tex');
      expect(content).toBe('once');
      expect(await fixtureRevision(projectId)).toBe(BigInt(1));

      // A retry with the same key/body replays exactly (no second write).
      const retry = await applyDocumentMutations({
        projectId,
        mutations: [{ kind: 'upsertText', path: 'idem.tex', content: 'once' }],
        idempotency: { principal, operation, idempotencyKey: key, requestHash },
      });
      expect(retry.replayed).toBe(true);
      expect(retry.revision).toBe(BigInt(1));
      expect(await fixtureRevision(projectId)).toBe(BigInt(1));
    });

    it('the same key with a different body is a 409, never a replay', async () => {
      const key = 'key-body-mismatch';
      const first = await applyDocumentMutations({
        projectId,
        mutations: [{ kind: 'upsertText', path: 'idem.tex', content: 'v1' }],
        idempotency: { principal, operation, idempotencyKey: key, requestHash: sha256Sync('body-1') },
      });
      expect(first.replayed).toBe(false);

      await expect(
        applyDocumentMutations({
          projectId,
          mutations: [{ kind: 'upsertText', path: 'idem.tex', content: 'v2' }],
          idempotency: { principal, operation, idempotencyKey: key, requestHash: sha256Sync('body-2') },
        }),
      ).rejects.toMatchObject({ statusCode: 409, code: 'IDEMPOTENCY_KEY_REUSED' });
      expect(await getFileContent(projectId, 'idem.tex')).toBe('v1');
    });
  });
});
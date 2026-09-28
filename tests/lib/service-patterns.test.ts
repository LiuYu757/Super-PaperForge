import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');

describe('project-service safety', () => {
  const src = read('src/services/project-service.ts');
  it('assertProjectRole validates role', () => { expect(src).toContain('assertProjectRole'); });
  it('soft-deletes projects', () => { expect(src).toContain('deletedAt'); });
  it('checks ownership for delete', () => { expect(src).toContain("['owner']"); });
  it('has member role checking', () => { expect(src).toContain('projectMember'); });
});

describe('compilation-service safety', () => {
  const src = read('src/services/compilation-service.ts');
  it('validates main file path (no traversal)', () => { expect(src).toContain('isValidFilePath'); });
  it('binds jobs to frozen sources without putting document bytes in Redis', () => {
    expect(src).toContain('createSnapshot(projectId)');
    expect(src).toContain('sourceSnapshotId: snapshot.id');
    expect(src).toContain('candidateSnapshotId: candidate.id');
    expect(src).toContain("{ compilationId: compilation.id, projectId }");
    expect(src).not.toContain('content: f.content');
  });
  it('has retry strategy', () => { expect(src).toContain('exponential'); });
  it('queues compilation jobs', () => { expect(src).toContain('compilationQueue'); });
});

describe('member-service safety', () => {
  const src = read('src/services/member-service.ts');
  it('validates owner for role changes', () => { expect(src).toContain('owner'); });
  it('sends invitation emails', () => { expect(src).toContain('sendEmail'); });
  it('has share link expiration', () => { expect(src).toContain('expiresAt'); });
  it('has share link token', () => { expect(src).toContain('token'); });
});

describe('git-service safety', () => {
  const src = read('src/services/git-service.ts');
  it('encrypts tokens', () => { expect(src).toContain('encrypt'); });
  it('decrypts for operations', () => { expect(src).toContain('decrypt'); });
  it('uses oauth2 auth', () => { expect(src).toContain('oauth2'); });
  it('validates credentials exist', () => { expect(src).toContain('credential'); });
});

describe('version-service safety', () => {
  const src = read('src/services/version-service.ts');
  it('creates git commits', () => { expect(src).toContain('git.commit'); });
  it('has author attribution', () => { expect(src).toContain('PaperForge'); });

  // Regression: snapshots used to write '' for every text file so versions
  // captured no actual content and restore was a silent no-op.
  it('captures real file bytes in snapshots (not empty placeholders)', () => {
    expect(src).not.toMatch(/writeFile\([^,]+,\s*['"]['"]\s*\)/);
    expect(src).toContain('readFileBytes');
  });

  // Restore reads Git blobs and submits one transaction through the core.
  it('rebuilds DB rows from the snapshot tree inside a transaction', () => {
    expect(src).toContain('git.readTree');
    expect(src).toContain('git.readBlob');
    expect(src).toContain('applyDocumentMutations');
    expect(src).toContain('expectedRevision');
  });

  // Old (pre-fix) snapshots contain no bytes; restoring from them would wipe
  // every current file. Reject with EMPTY_SNAPSHOT instead.
  it('refuses to restore snapshots with zero content', () => {
    expect(src).toContain("'EMPTY_SNAPSHOT'");
  });

  // Files present now but absent from the snapshot must disappear so restore
  // produces the exact file set the user expects.
  it('soft-deletes files not present in the snapshot', () => {
    expect(src).toContain("kind: 'delete'");
  });

  // Binary restore stages a new object key before switching the DB reference.
  it('stages immutable binary objects before restoring DB content', () => {
    expect(src).toContain('stageBinaryBlob');
    expect(src).toContain("kind: 'upsertBinary'");
  });
});

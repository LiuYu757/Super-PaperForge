import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('project CRUD routes', () => {
  const list = readFileSync(join(process.cwd(), 'src/app/api/v1/projects/route.ts'), 'utf-8');
  it('GET uses apiSuccess', () => { expect(list).toContain('apiSuccess'); });
  it('POST uses apiSuccess', () => { expect(list).toContain('201'); });
  it('has auth check', () => { expect(list).toContain('ApiErrors'); });

  const detail = readFileSync(join(process.cwd(), 'src/app/api/v1/projects/[id]/route.ts'), 'utf-8');
  it('has GET', () => { expect(detail).toContain('GET'); });
  it('has PATCH', () => { expect(detail).toContain('PATCH'); });
  it('has DELETE', () => { expect(detail).toContain('DELETE'); });
  it('uses updateProjectSchema', () => { expect(detail).toContain('updateProjectSchema'); });
});

describe('project mutation audit logging', () => {
  const detail = readFileSync(join(process.cwd(), 'src/app/api/v1/projects/[id]/route.ts'), 'utf-8');
  const membersRoute = readFileSync(join(process.cwd(), 'src/app/api/v1/projects/[id]/members/route.ts'), 'utf-8');
  const memberRoute = readFileSync(join(process.cwd(), 'src/app/api/v1/projects/[id]/members/[userId]/route.ts'), 'utf-8');
  const restoreRoute = readFileSync(join(process.cwd(), 'src/app/api/v1/projects/[id]/versions/[versionId]/restore/route.ts'), 'utf-8');

  it('project PATCH emits audit event', () => {
    expect(detail).toContain('logAuditAction');
    expect(detail).toContain('project.updated');
  });

  it('member PATCH emits audit event with role change', () => {
    expect(memberRoute).toContain('logAuditAction');
    expect(memberRoute).toContain('member.role_changed');
  });

  it('member invite emits audit event and uses centralized rate limit', () => {
    expect(membersRoute).toContain('logAuditAction');
    expect(membersRoute).toContain('member.invited');
    expect(membersRoute).toContain('PROJECT_INVITE');
  });

  it('member DELETE emits audit event', () => {
    expect(memberRoute).toContain('member.removed');
  });

  it('member operations are rate-limited', () => {
    expect(memberRoute).toContain('enforceRateLimit');
    expect(memberRoute).toContain('rate:member-op:');
    expect(memberRoute).toContain('PROJECT_MEMBER_OP');
  });

  it('version restore emits audit event', () => {
    expect(restoreRoute).toContain('logAuditAction');
    expect(restoreRoute).toContain('version.restored');
  });

  it('version restore is rate-limited', () => {
    expect(restoreRoute).toContain('enforceRateLimit');
    expect(restoreRoute).toContain('rate:version-restore:');
    expect(restoreRoute).toContain('VERSION_RESTORE');
  });
});

describe('project and version mutation rate limits', () => {
  it('project PATCH and DELETE are rate-limited', () => {
    const c = readFileSync(join(process.cwd(), 'src/app/api/v1/projects/[id]/route.ts'), 'utf-8');
    expect(c).toContain('enforceRateLimit');
    expect(c).toContain('rate:project-mutate:');
    expect(c).toContain('PROJECT_MUTATE');
  });

  it('version create POST is rate-limited', () => {
    const c = readFileSync(join(process.cwd(), 'src/app/api/v1/projects/[id]/versions/route.ts'), 'utf-8');
    expect(c).toContain('enforceRateLimit');
    expect(c).toContain('VERSION_CREATE');
  });

  it('version create POST emits version.created audit event', () => {
    const c = readFileSync(join(process.cwd(), 'src/app/api/v1/projects/[id]/versions/route.ts'), 'utf-8');
    expect(c).toContain('logAuditAction');
    expect(c).toContain('version.created');
  });
});

describe('project creation and sharing audit trail', () => {
  it('project POST emits project.created audit event', () => {
    const c = readFileSync(join(process.cwd(), 'src/app/api/v1/projects/route.ts'), 'utf-8');
    expect(c).toContain('logAuditAction');
    expect(c).toContain('project.created');
    expect(c).toContain('PROJECT_CREATE');
  });

  it('share-link POST emits share_link.created audit event', () => {
    const c = readFileSync(join(process.cwd(), 'src/app/api/v1/projects/[id]/share-link/route.ts'), 'utf-8');
    expect(c).toContain('logAuditAction');
    expect(c).toContain('share_link.created');
  });

  it('git push emits git.pushed audit event', () => {
    const c = readFileSync(join(process.cwd(), 'src/app/api/v1/projects/[id]/git/push/route.ts'), 'utf-8');
    expect(c).toContain('logAuditAction');
    expect(c).toContain('git.pushed');
  });

  it('join/[token] has rate limiting and emits member.joined_via_link', () => {
    const c = readFileSync(join(process.cwd(), 'src/app/api/v1/join/[token]/route.ts'), 'utf-8');
    expect(c).toContain('enforceRateLimit');
    expect(c).toContain('logAuditAction');
    expect(c).toContain('member.joined_via_link');
  });
});

describe('remaining route security hardening', () => {
  it('file PUT has audit event and rate limit', () => {
    const c = readFileSync(join(process.cwd(), 'src/app/api/v1/projects/[id]/files/[...path]/route.ts'), 'utf-8');
    const putIdx = c.indexOf('async function PUT');
    expect(putIdx).toBeGreaterThan(-1);
    const putSection = c.slice(putIdx);
    expect(putSection).toContain('enforceRateLimit');
    expect(putSection).toContain('rate:file-write:');
    expect(putSection).toContain('FILE_WRITE');
    expect(putSection).toContain('logAuditAction');
    expect(putSection).toContain('file.updated');
  });

  it('file PUT enforces the text size limit by UTF-8 bytes', () => {
    const c = readFileSync(join(process.cwd(), 'src/app/api/v1/projects/[id]/files/[...path]/route.ts'), 'utf-8');
    const putIdx = c.indexOf('async function PUT');
    expect(putIdx).toBeGreaterThan(-1);
    const putSection = c.slice(putIdx, c.indexOf('async function DELETE'));
    expect(putSection).toContain("Buffer.byteLength(content, 'utf8')");
    expect(putSection).not.toContain('content.length > LIMITS.MAX_FILE_SIZE');
  });

  it('git/link POST has rate limiting and audit log', () => {
    const c = readFileSync(join(process.cwd(), 'src/app/api/v1/projects/[id]/git/link/route.ts'), 'utf-8');
    expect(c).toContain('enforceRateLimit');
    expect(c).toContain('GIT_OP');
    expect(c).toContain('logAuditAction');
    expect(c).toContain('git.linked');
  });

  it('share-link DELETE has rate limiting and audit log', () => {
    const c = readFileSync(join(process.cwd(), 'src/app/api/v1/projects/[id]/share-link/[linkId]/route.ts'), 'utf-8');
    expect(c).toContain('enforceRateLimit');
    expect(c).toContain('SHARE_LINK');
    expect(c).toContain('rate:share-link:${requesterId}');
    expect(c).toContain('logAuditAction');
    expect(c).toContain('share_link.revoked');
  });

  it('file DELETE shares the file-write rate bucket', () => {
    const c = readFileSync(join(process.cwd(), 'src/app/api/v1/projects/[id]/files/[...path]/route.ts'), 'utf-8');
    const deleteIdx = c.indexOf('async function DELETE');
    expect(deleteIdx).toBeGreaterThan(-1);
    const deleteSection = c.slice(deleteIdx);
    expect(deleteSection).toContain('enforceRateLimit');
    expect(deleteSection).toContain('rate:file-write:');
    expect(deleteSection).toContain('FILE_WRITE');
    expect(deleteSection).toContain('logAuditAction');
    expect(deleteSection).toContain('file.deleted');
  });

  it('file upload POST has audit event', () => {
    const c = readFileSync(join(process.cwd(), 'src/app/api/v1/projects/[id]/files/upload/route.ts'), 'utf-8');
    expect(c).toContain('logAuditAction');
    expect(c).toContain('file.uploaded');
  });

  it('project compile route emits audit event', () => {
    const c = readFileSync(join(process.cwd(), 'src/app/api/v1/projects/[id]/compile/route.ts'), 'utf-8');
    const service = readFileSync(join(process.cwd(), 'src/services/compilation-service.ts'), 'utf-8');
    expect(c).toContain('triggerCompilation');
    expect(service).toContain("action: 'project.compiled'");
    expect(service).toContain('tx.auditLog.create');
  });

  it('project export GET emits audit event', () => {
    const c = readFileSync(join(process.cwd(), 'src/app/api/v1/projects/[id]/export/route.ts'), 'utf-8');
    expect(c).toContain('logAuditAction');
    expect(c).toContain('project.exported');
  });
});

describe('project service', () => {
  const s = readFileSync(join(process.cwd(), 'src/services/project-service.ts'), 'utf-8');
  it('has listProjects', () => { expect(s).toContain('listProjects'); });
  it('has getProject', () => { expect(s).toContain('getProject'); });
  it('has createProject', () => { expect(s).toContain('createProject'); });
  it('has deleteProject', () => { expect(s).toContain('deleteProject'); });
  it('has assertProjectRole', () => { expect(s).toContain('assertProjectRole'); });
});

describe('file service', () => {
  const f = readFileSync(join(process.cwd(), 'src/services/file-service.ts'), 'utf-8');
  it('has listFiles', () => { expect(f).toContain('listFiles'); });
  it('has createFile', () => { expect(f).toContain('createFile'); });
  it('has getFileContent', () => { expect(f).toContain('getFileContent'); });
  it('has uploadBinaryFile', () => { expect(f).toContain('uploadBinaryFile'); });
  it('uses MinIO', () => { expect(f).toContain('minio'); });
});

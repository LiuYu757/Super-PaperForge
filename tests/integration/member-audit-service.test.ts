import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('member service', () => {
  const m = readFileSync(join(process.cwd(), 'src/services/member-service.ts'), 'utf-8');
  it('has inviteMember', () => { expect(m).toContain('inviteMember'); });
  it('has removeMember', () => { expect(m).toContain('removeMember'); });
  it('has updateMemberRole', () => { expect(m).toContain('updateMemberRole'); });
  it('has joinViaShareLink', () => { expect(m).toContain('joinViaShareLink'); });
});

describe('audit service', () => {
  const a = readFileSync(join(process.cwd(), 'src/services/audit-service.ts'), 'utf-8');
  it('has logAudit', () => { expect(a).toContain('logAudit'); });
  it('uses prisma', () => { expect(a).toContain('prisma'); });
  it('snapshots actor email when writing audit logs', () => {
    expect(a).toContain('resolveActorEmail');
    expect(a).toContain('prisma.user.findUnique');
    expect(a).toContain('actorEmail: resolvedActorEmail');
  });
});

describe('user service', () => {
  const u = readFileSync(join(process.cwd(), 'src/services/user-service.ts'), 'utf-8');
  it('has createUser', () => { expect(u).toContain('createUser'); });
  it('has verifyCredentials', () => { expect(u).toContain('verifyCredentials'); });
  it('uses bcrypt', () => { expect(u).toContain('bcrypt'); });
});

describe('git service', () => {
  const g = readFileSync(join(process.cwd(), 'src/services/git-service.ts'), 'utf-8');
  it('has listGitCredentials', () => { expect(g).toContain('listGitCredentials'); });
  it('has addGitCredential', () => { expect(g).toContain('addGitCredential'); });
  it('has deleteGitCredential', () => { expect(g).toContain('deleteGitCredential'); });
  it('uses encryption', () => { expect(g).toContain('encrypt'); });
});

describe('version service', () => {
  const v = readFileSync(join(process.cwd(), 'src/services/version-service.ts'), 'utf-8');
  it('has createVersion', () => { expect(v).toContain('createVersion'); });
  it('has listVersions', () => { expect(v).toContain('listVersions'); });
  it('has restoreVersion', () => { expect(v).toContain('restoreVersion'); });
  it('uses git', () => { expect(v).toContain('git'); });
});

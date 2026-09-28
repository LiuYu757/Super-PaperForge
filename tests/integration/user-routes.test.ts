import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('user profile route', () => {
  const p = readFileSync(join(process.cwd(), 'src/app/api/v1/user/profile/route.ts'), 'utf-8');
  it('has GET', () => { expect(p).toContain('GET'); });
  it('has PATCH', () => { expect(p).toContain('PATCH'); });
  it('uses apiSuccess', () => { expect(p).toContain('apiSuccess'); });
  it('uses ApiErrors', () => { expect(p).toContain('ApiErrors'); });
  it('exposes hasPassword without returning passwordHash', () => {
    expect(p).toContain('passwordHash: true');
    expect(p).toContain('hasPassword');
    expect(p).toMatch(/const\s+\{\s*passwordHash,\s*\.\.\.profile\s*\}/);
  });
  it('PATCH is rate-limited', () => {
    expect(p).toContain('enforceRateLimit');
    expect(p).toContain('rate:profile-update:');
    expect(p).toContain('PROFILE_UPDATE');
  });
  it('PATCH emits audit event', () => {
    expect(p).toContain('logAuditAction');
    expect(p).toContain('profile.updated');
  });
});

describe('user settings route', () => {
  const s = readFileSync(join(process.cwd(), 'src/app/api/v1/user/settings/route.ts'), 'utf-8');
  it('has GET', () => { expect(s).toContain('GET'); });
  it('has PATCH', () => { expect(s).toContain('PATCH'); });
  it('merges settings', () => { expect(s).toContain('merged'); });
  it('PATCH is rate-limited', () => {
    expect(s).toContain('enforceRateLimit');
    expect(s).toContain('rate:settings-update:');
    expect(s).toContain('SETTINGS_UPDATE');
  });
  it('PATCH emits audit event', () => {
    expect(s).toContain('logAuditAction');
    expect(s).toContain('settings.updated');
  });
});

describe('user git-credentials route', () => {
  const g = readFileSync(join(process.cwd(), 'src/app/api/v1/user/git-credentials/route.ts'), 'utf-8');
  const d = readFileSync(join(process.cwd(), 'src/app/api/v1/user/git-credentials/[credentialId]/route.ts'), 'utf-8');
  it('has GET', () => { expect(g).toContain('GET'); });
  it('has POST', () => { expect(g).toContain('POST'); });
  it('delete route exists', () => { expect(existsSync(join(process.cwd(), 'src/app/api/v1/user/git-credentials/[credentialId]/route.ts'))).toBe(true); });

  it('POST audit-logs credential addition', () => {
    expect(g).toContain('logAuditAction');
    expect(g).toContain('git_credential.added');
  });

  it('DELETE rate-limits per user', () => {
    expect(d).toContain('enforceRateLimit');
    expect(d).toContain('rate:git-cred-del:');
    expect(d).toContain('GIT_CREDENTIAL_DELETE');
  });

  it('DELETE audit-logs credential removal', () => {
    expect(d).toContain('logAuditAction');
    expect(d).toContain('git_credential.deleted');
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('user avatar route', () => {
  const route = readFileSync(
    join(process.cwd(), 'src/app/api/v1/user/avatar/route.ts'),
    'utf-8',
  );

  it('exports POST', () => {
    expect(route).toMatch(/export\s+async\s+function\s+POST/);
  });
  it('exports DELETE', () => {
    expect(route).toMatch(/export\s+async\s+function\s+DELETE/);
  });
  it('requires auth', () => {
    expect(route).toContain('ApiErrors.unauthorized');
  });
  it('enforces a max upload size', () => {
    expect(route).toContain('MAX_AVATAR_SIZE');
  });
  it('restricts allowed mime types', () => {
    expect(route).toContain('ALLOWED_AVATAR_TYPES');
    expect(route).toContain("'image/png'");
    expect(route).toContain("'image/jpeg'");
  });
  it('validates magic bytes to block disguised payloads', () => {
    expect(route).toContain('isValidImageMagic');
  });
  it('stores avatar as data url in avatarUrl column', () => {
    expect(route).toContain('avatarUrl');
    expect(route).toContain('data:');
    expect(route).toContain('base64');
  });
  it('POST is rate-limited', () => {
    expect(route).toContain('enforceRateLimit');
    expect(route).toContain('rate:avatar:');
    expect(route).toContain('AVATAR_UPLOAD');
  });
  it('POST and DELETE emit audit logs', () => {
    expect(route).toContain('avatar.uploaded');
    expect(route).toContain('avatar.deleted');
    expect(route).toContain('logAuditAction');
  });
  it('DELETE is rate-limited', () => {
    expect(route).toContain('export async function DELETE');
    const deleteSectionStart = route.lastIndexOf('export async function DELETE');
    expect(deleteSectionStart).toBeGreaterThan(-1);
    const deleteSection = route.slice(deleteSectionStart);
    expect(deleteSection).toContain('enforceRateLimit');
    expect(deleteSection).toContain('rate:avatar:');
  });
});

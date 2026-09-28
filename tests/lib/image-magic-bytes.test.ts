import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The avatar route's magic-byte validator (isValidImageMagic) is the only
 * thing standing between a disguised executable and a base64 round-trip
 * into the DB. We assert its existence and shape structurally so a future
 * refactor can't silently drop the check.
 */
const route = readFileSync(
  join(process.cwd(), 'src/app/api/v1/user/avatar/route.ts'),
  'utf-8',
);

describe('avatar magic-byte enforcement', () => {
  it('declares the validator helper', () => {
    expect(route).toMatch(/function\s+isValidImageMagic/);
  });

  it('asserts each accepted MIME type has a corresponding magic-byte case', () => {
    expect(route).toMatch(/case\s+'image\/png'/);
    expect(route).toMatch(/case\s+'image\/jpeg'/);
    expect(route).toMatch(/case\s+'image\/gif'/);
    expect(route).toMatch(/case\s+'image\/webp'/);
  });

  it('checks PNG signature bytes', () => {
    expect(route).toContain('0x89');
    expect(route).toContain('0x50');
    expect(route).toContain('0x4e');
    expect(route).toContain('0x47');
  });

  it('checks JPEG SOI marker', () => {
    expect(route).toContain('0xff');
    expect(route).toContain('0xd8');
  });

  it('rejects when magic-byte check fails (INVALID_IMAGE error code)', () => {
    expect(route).toContain('INVALID_IMAGE');
  });

  it('only persists after validation passes', () => {
    // The avatarUrl write must come AFTER the magic-byte check, not before.
    const magicIdx = route.indexOf('isValidImageMagic(buffer');
    const writeIdx = route.indexOf('avatarUrl: dataUrl');
    expect(magicIdx).toBeGreaterThan(-1);
    expect(writeIdx).toBeGreaterThan(magicIdx);
  });
});

import { describe, it, expect } from 'vitest';
import { RATE_LIMITS, AUTH, EDITOR, LIMITS, isValidFilePath } from '@/lib/constants';

describe('constants', () => {
  it('rate limits are defined', () => {
    expect(RATE_LIMITS.LOGIN.limit).toBe(10);
    expect(RATE_LIMITS.COMPILATION.windowSeconds).toBe(60);
    expect(RATE_LIMITS.EXPORT.windowSeconds).toBe(3600);
  });

  it('auth constants are reasonable', () => {
    expect(AUTH.MAX_FAILED_ATTEMPTS).toBeGreaterThanOrEqual(10);
    expect(AUTH.JWT_MIN_SECRET_LENGTH).toBe(32);
    expect(AUTH.SESSION_MAX_AGE).toBe(604800); // 7 days
  });

  it('editor constants are defined', () => {
    expect(EDITOR.AUTO_COMPILE_DEBOUNCE_MS).toBe(2000);
    expect(EDITOR.MAX_POLL_ATTEMPTS).toBe(120);
  });

  it('limits are reasonable', () => {
    expect(LIMITS.MAX_FILE_SIZE).toBe(50 * 1024 * 1024);
    expect(LIMITS.MAX_PROJECTS_PER_PAGE).toBe(200);
  });
});

describe('isValidFilePath', () => {
  it('allows normal paths', () => {
    expect(isValidFilePath('main.tex')).toBe(true);
    expect(isValidFilePath('sections/intro.tex')).toBe(true);
    expect(isValidFilePath('images/fig1.png')).toBe(true);
  });

  it('rejects directory traversal', () => {
    expect(isValidFilePath('../etc/passwd')).toBe(false);
    expect(isValidFilePath('sections/../../secret')).toBe(false);
  });

  it('rejects absolute paths', () => {
    expect(isValidFilePath('/etc/passwd')).toBe(false);
  });

  it('rejects overly long paths', () => {
    expect(isValidFilePath('a'.repeat(1025))).toBe(false);
  });
});

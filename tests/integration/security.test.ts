import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { registerSchema, loginSchema, changePasswordSchema, createProjectSchema, filePathSchema, safeString } from '@/lib/validation';
import { RATE_LIMITS } from '@/lib/constants';

describe('security integration', () => {
  describe('XSS prevention in all schemas', () => {
    it('register rejects script tags in name', () => {
      expect(registerSchema.safeParse({
        email: 'a@b.com', name: '<script>alert(1)</script>', password: 'Valid1Pass',
      }).success).toBe(false);
    });

    it('register rejects javascript: in name', () => {
      expect(registerSchema.safeParse({
        email: 'a@b.com', name: 'javascript:void(0)', password: 'Valid1Pass',
      }).success).toBe(false);
    });

    it('register rejects onload= in name', () => {
      expect(registerSchema.safeParse({
        email: 'a@b.com', name: 'onload=alert(1)', password: 'Valid1Pass',
      }).success).toBe(false);
    });

    it('project name rejects script tags', () => {
      expect(createProjectSchema.safeParse({
        name: '<script>document.cookie</script>',
      }).success).toBe(false);
    });
  });

  describe('path traversal prevention', () => {
    it('blocks ../ in file paths', () => {
      expect(filePathSchema.safeParse('../../etc/shadow').success).toBe(false);
    });

    it('blocks /absolute paths', () => {
      expect(filePathSchema.safeParse('/etc/passwd').success).toBe(false);
    });

    it('blocks backslash traversal', () => {
      expect(filePathSchema.safeParse('..\\windows\\system32').success).toBe(false);
    });

    it('allows nested directories', () => {
      expect(filePathSchema.safeParse('chapters/01/intro.tex').success).toBe(true);
    });
  });

  describe('safeString XSS validator', () => {
    it('blocks HTML script tags in profile fields', () => {
      expect(safeString.safeParse('<script>alert(1)</script>').success).toBe(false);
    });

    it('blocks HTML tags in general', () => {
      expect(safeString.safeParse('<b>bold</b>').success).toBe(false);
    });

    it('blocks javascript: URI', () => {
      expect(safeString.safeParse('javascript:void(0)').success).toBe(false);
    });

    it('blocks inline event handlers', () => {
      expect(safeString.safeParse('onload=alert(1)').success).toBe(false);
      expect(safeString.safeParse('onclick = evil()').success).toBe(false);
    });

    it('allows normal text with ampersands and math', () => {
      expect(safeString.safeParse('AT&T Labs').success).toBe(true);
      expect(safeString.safeParse('x < 5 or x > 10').success).toBe(true);
      expect(safeString.safeParse('I ❤️ LaTeX').success).toBe(true);
    });

    it('profile route uses safeString for name and bio', () => {
      const route = readFileSync(
        join(process.cwd(), 'src/app/api/v1/user/profile/route.ts'),
        'utf-8',
      );
      expect(route).toContain('safeString');
      // name, institution, bio must all be guarded
      const schema = route.slice(route.indexOf('patchProfileSchema'));
      expect(schema).toContain('name: safeString');
      expect(schema).toContain('institution: safeString');
      expect(schema).toContain('bio: safeString');
    });
  });

  describe('avatar upload rate limit', () => {
    it('AVATAR_UPLOAD constant is defined', () => {
      expect(RATE_LIMITS.AVATAR_UPLOAD).toBeDefined();
      expect(RATE_LIMITS.AVATAR_UPLOAD.limit).toBeGreaterThanOrEqual(1);
    });

    it('avatar route enforces rate limit', () => {
      const route = readFileSync(
        join(process.cwd(), 'src/app/api/v1/user/avatar/route.ts'),
        'utf-8',
      );
      expect(route).toContain('enforceRateLimit');
      expect(route).toContain('AVATAR_UPLOAD');
    });
  });

  describe('password policy enforcement', () => {
    it('rejects password without uppercase', () => {
      expect(changePasswordSchema.safeParse({
        currentPassword: 'old', newPassword: 'nouppercase1', confirmPassword: 'nouppercase1',
      }).success).toBe(false);
    });

    it('rejects password without digit', () => {
      expect(changePasswordSchema.safeParse({
        currentPassword: 'old', newPassword: 'NoDigitHere', confirmPassword: 'NoDigitHere',
      }).success).toBe(false);
    });

    it('rejects mismatched confirm', () => {
      expect(changePasswordSchema.safeParse({
        currentPassword: 'old', newPassword: 'NewPass1', confirmPassword: 'Different1',
      }).success).toBe(false);
    });

    it('rejects same old and new', () => {
      expect(changePasswordSchema.safeParse({
        currentPassword: 'SamePass1', newPassword: 'SamePass1', confirmPassword: 'SamePass1',
      }).success).toBe(false);
    });
  });
});

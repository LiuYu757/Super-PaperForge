import { describe, it, expect } from 'vitest';
import { filePathSchema, BLOCKED_EXTENSIONS, ALLOWED_UPLOAD_TYPES, MAX_FILE_SIZE, MAX_PROJECT_SIZE, MAX_USER_STORAGE } from '@/lib/validation';

describe('file security validation', () => {
  describe('filePathSchema', () => {
    it('rejects path traversal with ..', () => {
      expect(filePathSchema.safeParse('../etc/passwd').success).toBe(false);
    });

    it('rejects absolute paths', () => {
      expect(filePathSchema.safeParse('/root/file').success).toBe(false);
    });

    it('accepts normal file paths', () => {
      expect(filePathSchema.safeParse('main.tex').success).toBe(true);
      expect(filePathSchema.safeParse('chapters/intro.tex').success).toBe(true);
      expect(filePathSchema.safeParse('images/fig1.png').success).toBe(true);
    });

    it('rejects empty path', () => {
      expect(filePathSchema.safeParse('').success).toBe(false);
    });

    it('rejects path over 1024 chars', () => {
      expect(filePathSchema.safeParse('a'.repeat(1025)).success).toBe(false);
    });
  });

  describe('BLOCKED_EXTENSIONS', () => {
    it('blocks executables', () => {
      expect(BLOCKED_EXTENSIONS.has('.exe')).toBe(true);
      expect(BLOCKED_EXTENSIONS.has('.bat')).toBe(true);
      expect(BLOCKED_EXTENSIONS.has('.cmd')).toBe(true);
      expect(BLOCKED_EXTENSIONS.has('.msi')).toBe(true);
    });

    it('blocks scripts', () => {
      expect(BLOCKED_EXTENSIONS.has('.sh')).toBe(true);
      expect(BLOCKED_EXTENSIONS.has('.bash')).toBe(true);
      expect(BLOCKED_EXTENSIONS.has('.ps1')).toBe(true);
      expect(BLOCKED_EXTENSIONS.has('.vbs')).toBe(true);
    });

    it('allows LaTeX files', () => {
      expect(BLOCKED_EXTENSIONS.has('.tex')).toBe(false);
      expect(BLOCKED_EXTENSIONS.has('.bib')).toBe(false);
      expect(BLOCKED_EXTENSIONS.has('.cls')).toBe(false);
      expect(BLOCKED_EXTENSIONS.has('.sty')).toBe(false);
    });

    it('allows images', () => {
      expect(BLOCKED_EXTENSIONS.has('.png')).toBe(false);
      expect(BLOCKED_EXTENSIONS.has('.jpg')).toBe(false);
      expect(BLOCKED_EXTENSIONS.has('.pdf')).toBe(false);
    });
  });

  describe('size constants', () => {
    it('MAX_FILE_SIZE is 50MB', () => {
      expect(MAX_FILE_SIZE).toBe(50 * 1024 * 1024);
    });

    it('MAX_PROJECT_SIZE is 500MB', () => {
      expect(MAX_PROJECT_SIZE).toBe(500 * 1024 * 1024);
    });

    it('MAX_USER_STORAGE is 2GB', () => {
      expect(MAX_USER_STORAGE).toBe(2 * 1024 * 1024 * 1024);
    });
  });
});

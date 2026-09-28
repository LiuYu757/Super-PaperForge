import { describe, it, expect } from 'vitest';
import { sanitizeCallbackUrl } from '@/lib/redirect';

describe('sanitizeCallbackUrl', () => {
  describe('valid relative paths — pass through', () => {
    it('accepts root-relative path', () => {
      expect(sanitizeCallbackUrl('/projects')).toBe('/projects');
    });

    it('accepts nested path', () => {
      expect(sanitizeCallbackUrl('/admin/settings')).toBe('/admin/settings');
    });

    it('accepts path with query string', () => {
      expect(sanitizeCallbackUrl('/projects?q=1')).toBe('/projects?q=1');
    });

    it('accepts path with hash', () => {
      expect(sanitizeCallbackUrl('/editor/abc#section')).toBe('/editor/abc#section');
    });
  });

  describe('open redirect vectors — fall back to default', () => {
    it('rejects absolute URL with https scheme', () => {
      expect(sanitizeCallbackUrl('https://evil.com')).toBe('/projects');
    });

    it('rejects absolute URL with http scheme', () => {
      expect(sanitizeCallbackUrl('http://evil.com/steal')).toBe('/projects');
    });

    it('rejects protocol-relative URL', () => {
      expect(sanitizeCallbackUrl('//evil.com')).toBe('/projects');
    });

    it('rejects encoded protocol-relative URL', () => {
      // /%2F%2Fevil.com decodes to //evil.com
      expect(sanitizeCallbackUrl('/%2F%2Fevil.com')).toBe('/projects');
    });

    it('rejects double-encoded protocol-relative URL', () => {
      expect(sanitizeCallbackUrl('/%252F%252Fevil.com')).toBe('/projects');
    });

    it('rejects backslash protocol-relative variants', () => {
      expect(sanitizeCallbackUrl('/\\\\evil.com')).toBe('/projects');
      expect(sanitizeCallbackUrl('/%5C%5Cevil.com')).toBe('/projects');
      expect(sanitizeCallbackUrl('/%2F%5Cevil.com')).toBe('/projects');
    });

    it('rejects control characters', () => {
      expect(sanitizeCallbackUrl('/projects%0Ahttps://evil.com')).toBe('/projects');
      expect(sanitizeCallbackUrl('/projects\nnext')).toBe('/projects');
    });

    it('rejects javascript: scheme', () => {
      expect(sanitizeCallbackUrl('javascript:void(0)')).toBe('/projects');
    });

    it('rejects data: URI', () => {
      expect(sanitizeCallbackUrl('data:text/html,<h1>hi</h1>')).toBe('/projects');
    });
  });

  describe('null / empty — fall back to default', () => {
    it('returns fallback for null', () => {
      expect(sanitizeCallbackUrl(null)).toBe('/projects');
    });

    it('returns fallback for undefined', () => {
      expect(sanitizeCallbackUrl(undefined)).toBe('/projects');
    });

    it('returns fallback for empty string', () => {
      expect(sanitizeCallbackUrl('')).toBe('/projects');
    });
  });

  describe('custom fallback', () => {
    it('uses custom fallback when provided', () => {
      expect(sanitizeCallbackUrl(null, '/home')).toBe('/home');
    });

    it('uses custom fallback for invalid URL', () => {
      expect(sanitizeCallbackUrl('https://evil.com', '/dashboard')).toBe('/dashboard');
    });
  });

  describe('middleware callbackUrl integration', () => {
    it('honours the callbackUrl set by middleware for admin redirect', () => {
      expect(sanitizeCallbackUrl('/admin/audit-log')).toBe('/admin/audit-log');
    });

    it('honours the callbackUrl set by middleware for projects redirect', () => {
      expect(sanitizeCallbackUrl('/projects/abc123')).toBe('/projects/abc123');
    });

    it('honours the callbackUrl set by middleware for editor redirect', () => {
      expect(sanitizeCallbackUrl('/editor/abc123')).toBe('/editor/abc123');
    });
  });
});

import { describe, it, expect } from 'vitest';
import { formatBytes, getInitials } from '@/lib/utils';

describe('formatBytes', () => {
  it('returns 0 B for null / undefined / 0 / negative input', () => {
    expect(formatBytes(null)).toBe('0 B');
    expect(formatBytes(undefined)).toBe('0 B');
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-1024)).toBe('0 B');
  });

  it('formats bytes', () => {
    expect(formatBytes(1)).toBe('1 B');
    expect(formatBytes(512)).toBe('512 B');
  });

  it('formats KB / MB / GB', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2.00 GB');
  });

  it('accepts numeric strings (from Prisma BigInt fields)', () => {
    expect(formatBytes('1024')).toBe('1.0 KB');
    expect(formatBytes('1048576')).toBe('1.0 MB');
  });

  it('accepts bigint', () => {
    expect(formatBytes(BigInt(1024))).toBe('1.0 KB');
  });

  it('handles non-finite numeric strings', () => {
    expect(formatBytes('not-a-number')).toBe('0 B');
  });
});

describe('getInitials', () => {
  it('returns ? for null / empty', () => {
    expect(getInitials(null)).toBe('?');
    expect(getInitials('')).toBe('?');
  });

  it('returns up to two initials', () => {
    expect(getInitials('Ada Lovelace')).toBe('AL');
    expect(getInitials('grace hopper jr')).toBe('GH');
  });

  it('returns one initial for single-word names', () => {
    expect(getInitials('Madonna')).toBe('M');
  });

  it('handles extra whitespace', () => {
    expect(getInitials('  Ada   Lovelace  ')).toBe('AL');
  });
});

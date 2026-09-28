import { describe, it, expect } from 'vitest';
import { parseUuidParam, uuidSchema } from '@/lib/validation';
import { ApiError } from '@/lib/errors';

describe('uuidSchema', () => {
  it('accepts a canonical v4 UUID', () => {
    expect(uuidSchema.safeParse('550e8400-e29b-41d4-a716-446655440000').success).toBe(true);
  });

  it('rejects non-UUID strings', () => {
    expect(uuidSchema.safeParse('not-a-uuid').success).toBe(false);
    expect(uuidSchema.safeParse('').success).toBe(false);
    expect(uuidSchema.safeParse('123').success).toBe(false);
  });

  it('rejects nil UUID (version digit 0)', () => {
    expect(uuidSchema.safeParse('00000000-0000-0000-0000-000000000000').success).toBe(false);
  });
});

describe('parseUuidParam', () => {
  it('returns the lowercased uuid for a valid input', () => {
    expect(parseUuidParam('550E8400-E29B-41D4-A716-446655440000')).toBe(
      '550e8400-e29b-41d4-a716-446655440000',
    );
  });

  it('throws an ApiError(400, INVALID_UUID) for invalid input', () => {
    let caught: unknown;
    try {
      parseUuidParam('bogus', 'projectId');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiError);
    const err = caught as ApiError;
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('INVALID_UUID');
    expect(err.message).toContain('projectId');
  });
});

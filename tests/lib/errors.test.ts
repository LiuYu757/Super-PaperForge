import { describe, it, expect } from 'vitest';
import { ApiError, errorResponse } from '@/lib/errors';
import { ZodError, ZodIssueCode } from 'zod';

describe('ApiError', () => {
  it('creates error with status and message', () => {
    const error = new ApiError(404, 'Not found');
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('Not found');
    expect(error.name).toBe('ApiError');
  });

  it('supports optional error code', () => {
    const error = new ApiError(400, 'Bad request', 'INVALID_INPUT');
    expect(error.code).toBe('INVALID_INPUT');
  });

  it('is an instance of Error', () => {
    const error = new ApiError(500, 'Internal');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('errorResponse', () => {
  it('handles ApiError', async () => {
    const error = new ApiError(404, 'Project not found', 'NOT_FOUND');
    const res = errorResponse(error);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('Project not found');
  });

  it('handles ApiError without code', async () => {
    const error = new ApiError(403, 'Forbidden');
    const res = errorResponse(error);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error.code).toBe('ERR_403');
  });

  it('handles ZodError', async () => {
    const zodError = new ZodError([
      {
        code: ZodIssueCode.too_small,
        minimum: 1,
        inclusive: true,
        message: 'Required',
        path: ['email'],
      } as any,
    ]);

    const res = errorResponse(zodError);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.fields.email).toContain('Required');
  });

  it('handles unknown errors', async () => {
    const res = errorResponse(new Error('Something broke'));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });

  it('handles non-Error objects', async () => {
    const res = errorResponse('string error');
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error.message).toBe('Internal server error');
  });
});

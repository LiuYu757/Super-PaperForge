import { describe, it, expect } from 'vitest';
import { errorResponse } from '@/lib/errors';

function makePrismaError(code: string, name = 'PrismaClientKnownRequestError') {
  const err: Error & { code?: string; meta?: Record<string, unknown> } = new Error(`prisma ${code}`);
  err.name = name;
  err.code = code;
  return err;
}

async function asJson(res: Response) {
  return JSON.parse(await res.text()) as { success: boolean; error: { code: string } };
}

describe('errorResponse Prisma mapping', () => {
  it('maps P2023 (malformed UUID) to 400 INVALID_INPUT', async () => {
    const res = errorResponse(makePrismaError('P2023'));
    expect(res.status).toBe(400);
    expect((await asJson(res)).error.code).toBe('INVALID_INPUT');
  });

  it('maps P2020 (value out of range) to 400 INVALID_INPUT', async () => {
    const res = errorResponse(makePrismaError('P2020'));
    expect(res.status).toBe(400);
    expect((await asJson(res)).error.code).toBe('INVALID_INPUT');
  });

  it('maps P2025 (not found) to 404 NOT_FOUND', async () => {
    const res = errorResponse(makePrismaError('P2025'));
    expect(res.status).toBe(404);
    expect((await asJson(res)).error.code).toBe('NOT_FOUND');
  });

  it('maps P2002 (unique constraint) to 409 CONFLICT', async () => {
    const res = errorResponse(makePrismaError('P2002'));
    expect(res.status).toBe(409);
    expect((await asJson(res)).error.code).toBe('CONFLICT');
  });

  it('maps P2003 (foreign key) to 409 CONFLICT', async () => {
    const res = errorResponse(makePrismaError('P2003'));
    expect(res.status).toBe(409);
    expect((await asJson(res)).error.code).toBe('CONFLICT');
  });

  it('maps PrismaClientValidationError to 400 INVALID_INPUT', async () => {
    const err = new Error('bad') as Error;
    err.name = 'PrismaClientValidationError';
    const res = errorResponse(err);
    expect(res.status).toBe(400);
    expect((await asJson(res)).error.code).toBe('INVALID_INPUT');
  });

  it('falls through to 500 INTERNAL_ERROR for unknown errors', async () => {
    const res = errorResponse(new Error('boom'));
    expect(res.status).toBe(500);
    expect((await asJson(res)).error.code).toBe('INTERNAL_ERROR');
  });
});

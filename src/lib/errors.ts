import { ZodError } from 'zod';
import { apiError, apiValidationError } from '@/lib/api-response';

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Prisma raises typed errors with a "code" field (P-codes). We don't import
 * Prisma types here to avoid bundling the client into edge runtime; instead
 * we structurally match by name + code shape.
 */
function isPrismaError(error: unknown): error is { name: string; code: string; meta?: Record<string, unknown> } {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: unknown; code?: unknown };
  return (
    typeof candidate.name === 'string' &&
    candidate.name.startsWith('PrismaClient') &&
    typeof candidate.code === 'string' &&
    candidate.code.startsWith('P')
  );
}

function isPrismaValidationError(error: unknown): boolean {
  return !!error && typeof error === 'object'
    && (error as { name?: string }).name === 'PrismaClientValidationError';
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return apiError(error.message, error.statusCode, error.code);
  }

  if (error instanceof ZodError) {
    return apiValidationError(error);
  }

  // Map common Prisma errors to user-meaningful HTTP responses so we
  // don't leak stack traces or surface bare 500s for things like
  // "malformed UUID in path param".
  if (isPrismaError(error)) {
    switch (error.code) {
      case 'P2023': // inconsistent column data (e.g. malformed UUID)
      case 'P2020': // value out of range
        return apiError('Invalid identifier in request', 400, 'INVALID_INPUT');
      case 'P2025': // record not found
        return apiError('Resource not found', 404, 'NOT_FOUND');
      case 'P2002': // unique constraint
        return apiError('Resource already exists', 409, 'CONFLICT');
      case 'P2003': // foreign key constraint
        return apiError('Cannot complete operation due to related resources', 409, 'CONFLICT');
    }
  }

  if (isPrismaValidationError(error)) {
    return apiError('Invalid request data', 400, 'INVALID_INPUT');
  }

  console.error('Unexpected error:', error);
  return apiError('Internal server error', 500, 'INTERNAL_ERROR');
}

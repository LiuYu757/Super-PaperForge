import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

interface ApiErrorDetail {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, nested) =>
      typeof nested === 'bigint' ? nested.toString() : nested,
    ),
  ) as T;
}

/**
 * Standardized success response
 */
export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json(
    jsonSafe({ success: true, data }),
    { status },
  );
}

/**
 * Standardized paginated response
 */
export function apiPaginated<T>(
  data: T[],
  pagination: { page: number; limit: number; total: number },
) {
  const pages = Math.ceil(pagination.total / pagination.limit);
  return NextResponse.json(
    jsonSafe({
      success: true,
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: pagination.total,
        pages,
        hasNext: pagination.page < pages,
        hasPrev: pagination.page > 1,
      },
    }),
    {
      status: 200,
      headers: {
        'X-Total-Count': String(pagination.total),
        'X-Page-Count': String(pages),
      },
    },
  );
}

/**
 * Standardized error response
 */
export function apiError(
  message: string,
  status: number,
  code?: string,
  details?: Record<string, unknown>,
) {
  const error: ApiErrorDetail = {
    code: code ?? `ERR_${status}`,
    message,
  };
  if (details) error.details = details;

  return NextResponse.json(
    jsonSafe({ success: false, error }),
    { status },
  );
}

/**
 * Handle Zod validation errors
 */
export function apiValidationError(error: ZodError) {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.');
    if (!fieldErrors[path]) fieldErrors[path] = [];
    fieldErrors[path].push(issue.message);
  }

  return apiError(
    'Validation failed',
    400,
    'VALIDATION_ERROR',
    { fields: fieldErrors },
  );
}

/**
 * Common error responses
 */
export const ApiErrors = {
  unauthorized: () => apiError('Authentication required', 401, 'AUTH_REQUIRED'),
  forbidden: () => apiError('Insufficient permissions', 403, 'FORBIDDEN'),
  notFound: (resource = 'Resource') => apiError(`${resource} not found`, 404, 'NOT_FOUND'),
  conflict: (message: string) => apiError(message, 409, 'CONFLICT'),
  rateLimited: () => apiError('Too many requests', 429, 'RATE_LIMITED'),
  internal: (message = 'Internal server error') => apiError(message, 500, 'INTERNAL_ERROR'),
} as const;

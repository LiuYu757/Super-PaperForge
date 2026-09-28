import { describe, it, expect } from 'vitest';
import { apiSuccess, apiError, apiPaginated, ApiErrors } from '@/lib/api-response';
import { errorResponse, ApiError } from '@/lib/errors';
import { ZodError, ZodIssueCode } from 'zod';

describe('API consistency across all endpoints', () => {
  it('all success responses have identical structure', async () => {
    const cases = [
      apiSuccess({ id: '1' }),
      apiSuccess([1, 2, 3]),
      apiSuccess(null),
      apiSuccess('string'),
      apiSuccess({ nested: { deep: true } }),
    ];
    for (const res of cases) {
      const body = await res.json();
      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('data');
      expect(body).not.toHaveProperty('error');
    }
  });

  it('all error responses have identical structure', async () => {
    const cases = [
      ApiErrors.unauthorized(),
      ApiErrors.forbidden(),
      ApiErrors.notFound('X'),
      ApiErrors.conflict('dup'),
      ApiErrors.rateLimited(),
      ApiErrors.internal(),
      apiError('custom', 418, 'TEAPOT'),
      errorResponse(new ApiError(400, 'bad')),
      errorResponse(new ZodError([{ code: ZodIssueCode.custom, message: 'x', path: ['f'] }])),
    ];
    for (const res of cases) {
      const body = await res.json();
      expect(body).toHaveProperty('success', false);
      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('code');
      expect(body.error).toHaveProperty('message');
      expect(body).not.toHaveProperty('data');
    }
  });

  it('paginated has both data and pagination', async () => {
    const body = await apiPaginated([1], { page: 1, limit: 10, total: 1 }).json();
    expect(body).toHaveProperty('success', true);
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('pagination');
    expect(body.pagination).toHaveProperty('page');
    expect(body.pagination).toHaveProperty('limit');
    expect(body.pagination).toHaveProperty('total');
    expect(body.pagination).toHaveProperty('pages');
    expect(body.pagination).toHaveProperty('hasNext');
    expect(body.pagination).toHaveProperty('hasPrev');
  });
});

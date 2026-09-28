import { describe, it, expect } from 'vitest';
import { apiSuccess, apiPaginated, apiError, ApiErrors } from '@/lib/api-response';
import { errorResponse, ApiError } from '@/lib/errors';

describe('API response format consistency', () => {
  it('apiSuccess always has success:true and data', async () => {
    const res = apiSuccess({ items: [1, 2, 3] });
    const body = await res.json();
    expect(body).toHaveProperty('success', true);
    expect(body).toHaveProperty('data');
    expect(body.data.items).toEqual([1, 2, 3]);
  });

  it('apiError always has success:false and error object', async () => {
    const res = apiError('Bad request', 400);
    const body = await res.json();
    expect(body).toHaveProperty('success', false);
    expect(body.error).toHaveProperty('message');
    expect(body.error).toHaveProperty('code');
  });

  it('ApiErrors presets return correct status codes', () => {
    expect(ApiErrors.unauthorized().status).toBe(401);
    expect(ApiErrors.forbidden().status).toBe(403);
    expect(ApiErrors.notFound().status).toBe(404);
    expect(ApiErrors.conflict('dup').status).toBe(409);
    expect(ApiErrors.rateLimited().status).toBe(429);
    expect(ApiErrors.internal().status).toBe(500);
  });

  it('errorResponse for ApiError matches apiError format', async () => {
    const res = errorResponse(new ApiError(404, 'Not found', 'NOT_FOUND'));
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('Not found');
  });

  it('apiPaginated includes all pagination fields', async () => {
    const res = apiPaginated([1, 2], { page: 2, limit: 10, total: 55 });
    const body = await res.json();
    expect(body.pagination).toEqual({
      page: 2,
      limit: 10,
      total: 55,
      pages: 6,
      hasNext: true,
      hasPrev: true,
    });
  });
});

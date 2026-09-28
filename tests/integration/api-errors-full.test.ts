import { describe, it, expect } from 'vitest';
import { ApiErrors, apiError } from '@/lib/api-response';
import { errorResponse, ApiError } from '@/lib/errors';
import { rateLimitHeaders } from '@/lib/rate-limit';

describe('API error system full coverage', () => {
  it('unauthorized has AUTH_REQUIRED code', async () => {
    expect((await ApiErrors.unauthorized().json()).error.code).toBe('AUTH_REQUIRED');
  });
  it('forbidden has FORBIDDEN code', async () => {
    expect((await ApiErrors.forbidden().json()).error.code).toBe('FORBIDDEN');
  });
  it('notFound default message', async () => {
    expect((await ApiErrors.notFound().json()).error.message).toBe('Resource not found');
  });
  it('notFound custom resource', async () => {
    expect((await ApiErrors.notFound('User').json()).error.message).toBe('User not found');
  });
  it('conflict message', async () => {
    expect((await ApiErrors.conflict('exists').json()).error.message).toBe('exists');
  });
  it('rateLimited code', async () => {
    expect((await ApiErrors.rateLimited().json()).error.code).toBe('RATE_LIMITED');
  });
  it('internal default', async () => {
    expect((await ApiErrors.internal().json()).error.code).toBe('INTERNAL_ERROR');
  });
  it('internal custom msg', async () => {
    expect((await ApiErrors.internal('DB down').json()).error.message).toBe('DB down');
  });
  it('apiError custom code+details', async () => {
    const r = await apiError('bad', 422, 'UNPROCESSABLE', { field: 'x' }).json();
    expect(r.error.code).toBe('UNPROCESSABLE');
    expect(r.error.details.field).toBe('x');
  });
  it('errorResponse preserves ApiError code', async () => {
    const r = await errorResponse(new ApiError(409, 'dup', 'DUPLICATE')).json();
    expect(r.error.code).toBe('DUPLICATE');
  });
  it('rateLimitHeaders has all fields when blocked', () => {
    const h = rateLimitHeaders(10, { allowed: false, remaining: 0, retryAfter: 30 });
    expect(h).toHaveProperty('X-RateLimit-Limit');
    expect(h).toHaveProperty('X-RateLimit-Remaining');
    expect(h).toHaveProperty('Retry-After');
    expect(h).toHaveProperty('X-RateLimit-Reset');
  });
  it('rateLimitHeaders omits retry when allowed', () => {
    const h = rateLimitHeaders(10, { allowed: true, remaining: 5 });
    expect(h['Retry-After']).toBeUndefined();
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit, enforceRateLimit } from '@/lib/rate-limit';

/**
 * Exercises the in-memory fallback branch (no Redis in the test env). When
 * Redis is unavailable, checkRateLimit MUST still enforce the cap — a
 * silently-permissive fallback would be worse than no rate limit at all
 * because operators would believe they were protected.
 */
describe('rate-limit memory fallback', () => {
  beforeEach(() => {
    // Reset the shared memory store between tests so counts don't leak.
    const g = globalThis as unknown as { _rateLimitMemory?: Map<string, unknown> };
    g._rateLimitMemory?.clear();
  });

  it('allows requests up to the limit and blocks the next one', async () => {
    const key = `rate:test:memory:${Date.now()}`;
    const r1 = await checkRateLimit(key, 3, 60);
    const r2 = await checkRateLimit(key, 3, 60);
    const r3 = await checkRateLimit(key, 3, 60);
    const r4 = await checkRateLimit(key, 3, 60);

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
    expect(r4.allowed).toBe(false);
    expect(r4.retryAfter).toBeGreaterThan(0);
  });

  it('enforceRateLimit short-circuits with a 429 + Retry-After when over the cap', async () => {
    const key = `rate:test:enforce:${Date.now()}`;
    const cfg = { limit: 1, windowSeconds: 60 };

    const first = await enforceRateLimit(key, cfg, 'too many');
    expect(first).toBeNull(); // allowed

    const second = await enforceRateLimit(key, cfg, 'too many');
    expect(second).not.toBeNull();
    expect(second!.status).toBe(429);
    expect(second!.headers.get('X-RateLimit-Limit')).toBe('1');
    expect(second!.headers.get('Retry-After')).toBeDefined();

    const body = JSON.parse(await second!.text());
    expect(body).toEqual({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'too many' },
    });
  });
});

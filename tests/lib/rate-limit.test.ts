import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Redis from 'ioredis';
import { checkRateLimit } from '@/lib/rate-limit';

let redisAvailable = false;
let redis: Redis | null = null;

beforeAll(async () => {
  try {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      connectTimeout: 2000,
      maxRetriesPerRequest: 0,
      lazyConnect: true,
    });
    await redis.connect();
    await redis.ping();
    redisAvailable = true;
  } catch {
    redisAvailable = false;
    redis = null;
  }
});

afterAll(async () => {
  if (redis) {
    await redis.quit();
  }
});

describe('rate-limit', () => {
  it('enforces limits through the available backend', async () => {
    const key = `test:rate-limit:fallback:${Date.now()}`;
    const limit = 2;
    const windowSeconds = 60;

    expect(await checkRateLimit(key, limit, windowSeconds)).toMatchObject({
      allowed: true,
      remaining: 1,
    });
    expect(await checkRateLimit(key, limit, windowSeconds)).toMatchObject({
      allowed: true,
      remaining: 0,
    });

    const blocked = await checkRateLimit(key, limit, windowSeconds);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it.skipIf(!redisAvailable)('should allow requests within the limit', async () => {
    const key = `test:rate-limit:${Date.now()}`;
    const limit = 5;
    const windowSeconds = 60;

    const result = await checkRateLimit(key, limit, windowSeconds);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(limit - 1);
    expect(result.retryAfter).toBeUndefined();
  });

  it.skipIf(!redisAvailable)('should block requests over the limit', async () => {
    const key = `test:rate-limit:block:${Date.now()}`;
    const limit = 3;
    const windowSeconds = 60;

    // Use up all allowed requests
    for (let i = 0; i < limit; i++) {
      const result = await checkRateLimit(key, limit, windowSeconds);
      expect(result.allowed).toBe(true);
    }

    // This one should be blocked
    const blocked = await checkRateLimit(key, limit, windowSeconds);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfter).toBeDefined();
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });
});

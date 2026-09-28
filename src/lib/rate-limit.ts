import { randomUUID } from 'crypto';
import { redis } from './redis';
import { env } from './env';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
}

type MemoryWindow = { hits: number[]; lastSeen: number };

const globalForRateLimit = globalThis as unknown as {
  _rateLimitMemory?: Map<string, MemoryWindow>;
  _rateLimitLastSweep?: number;
};

const MEMORY_SWEEP_INTERVAL_MS = 60_000;
const MEMORY_ENTRY_TTL_MS = 10 * 60_000;

function memoryStore(): Map<string, MemoryWindow> {
  if (!globalForRateLimit._rateLimitMemory) {
    globalForRateLimit._rateLimitMemory = new Map();
  }
  return globalForRateLimit._rateLimitMemory;
}

function sweepMemoryStore(now: number) {
  if ((globalForRateLimit._rateLimitLastSweep ?? 0) + MEMORY_SWEEP_INTERVAL_MS > now) return;
  globalForRateLimit._rateLimitLastSweep = now;

  memoryStore().forEach((bucket, key) => {
    if (bucket.lastSeen + MEMORY_ENTRY_TTL_MS < now) {
      memoryStore().delete(key);
    }
  });
}

function checkMemoryRateLimit(key: string, limit: number, windowMs: number, now: number): RateLimitResult {
  sweepMemoryStore(now);

  const store = memoryStore();
  const cutoff = now - windowMs;
  const bucket = store.get(key) ?? { hits: [], lastSeen: now };
  bucket.hits = bucket.hits.filter((timestamp) => timestamp > cutoff);
  bucket.lastSeen = now;

  if (bucket.hits.length >= limit) {
    const retryAfter = Math.max(Math.ceil((bucket.hits[0] + windowMs - now) / 1000), 1);
    store.set(key, bucket);
    return { allowed: false, remaining: 0, retryAfter };
  }

  bucket.hits.push(now);
  store.set(key, bucket);
  return { allowed: true, remaining: Math.max(limit - bucket.hits.length, 0) };
}

/**
 * Atomic Lua script for sliding-window rate limiting.
 * Runs entirely on the Redis server so concurrent requests are serialized.
 */
const LUA_RATE_LIMIT = `
  local key = KEYS[1]
  local limit = tonumber(ARGV[1])
  local windowMs = tonumber(ARGV[2])
  local now = tonumber(ARGV[3])
  local member = ARGV[4]

  redis.call('ZREMRANGEBYSCORE', key, 0, now - windowMs)
  local count = redis.call('ZCARD', key)

  if count < limit then
    redis.call('ZADD', key, now, member)
    redis.call('EXPIRE', key, math.ceil(windowMs / 1000))
    return limit - count - 1
  else
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    if oldest and #oldest >= 2 then
      return -(tonumber(oldest[2]) + windowMs - now)
    end
    return -1
  end
`;

/**
 * Redis sorted-set sliding window rate limiter.
 *
 * Uses an atomic Lua script to prevent TOCTOU race conditions
 * where concurrent requests could bypass the limit.
 *
 * @param key - Unique identifier for the rate limit (e.g. "rate:login:192.168.1.1")
 * @param limit - Maximum number of requests allowed in the window
 * @param windowSeconds - Duration of the sliding window in seconds
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  if (!redis) {
    if (env.RATE_LIMIT_STRICT) {
      return { allowed: false, remaining: 0, retryAfter: windowSeconds };
    }
    return checkMemoryRateLimit(key, limit, windowMs, now);
  }

  const member = `${now}:${randomUUID()}`;

  let result: number;
  try {
    result = await redis.eval(
      LUA_RATE_LIMIT, 1, key,
      String(limit), String(windowMs), String(now), member,
    ) as number;
  } catch {
    if (env.RATE_LIMIT_STRICT) {
      return { allowed: false, remaining: 0, retryAfter: windowSeconds };
    }
    return checkMemoryRateLimit(key, limit, windowMs, now);
  }

  if (result < 0) {
    const retryAfterMs = Math.abs(result);
    const retryAfter = Math.max(Math.ceil(retryAfterMs / 1000), 1);
    return { allowed: false, remaining: 0, retryAfter };
  }

  return { allowed: true, remaining: result };
}

/**
 * Generate standard rate limit headers for HTTP responses.
 */
export function rateLimitHeaders(
  limit: number,
  result: RateLimitResult,
): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(Math.max(0, result.remaining)),
  };
  if (result.retryAfter) {
    headers['Retry-After'] = String(result.retryAfter);
    headers['X-RateLimit-Reset'] = String(
      Math.ceil(Date.now() / 1000) + result.retryAfter,
    );
  }
  return headers;
}

import { NextResponse } from 'next/server';
import { apiError } from './api-response';

/**
 * Convenience wrapper: enforce a rate limit and short-circuit with a 429
 * response if exceeded. Returns null when the request is allowed.
 *
 * Usage:
 *   const limited = await enforceRateLimit(key, RATE_LIMITS.GIT_OP);
 *   if (limited) return limited;
 */
export async function enforceRateLimit(
  key: string,
  config: { limit: number; windowSeconds: number },
  message = 'Too many requests. Please slow down and try again.',
): Promise<NextResponse | null> {
  const result = await checkRateLimit(key, config.limit, config.windowSeconds);
  if (result.allowed) return null;
  const res = apiError(message, 429, 'RATE_LIMITED');
  Object.entries(rateLimitHeaders(config.limit, result)).forEach(([k, v]) => {
    res.headers.set(k, v);
  });
  return res;
}

/**
 * Best-effort client IP extraction from common proxy headers. Falls back to
 * a stable sentinel when the IP cannot be determined so rate-limit keys
 * remain deterministic per-deployment-environment.
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip') || headers.get('cf-connecting-ip') || 'unknown';
}

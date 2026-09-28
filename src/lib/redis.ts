import Redis, { type RedisOptions } from 'ioredis';
import { env } from './env';

const globalForRedis = globalThis as unknown as { _redis?: Redis | null; _redisInit?: boolean };

function createRedisClient(): Redis | null {
  const url = env.REDIS_URL;
  const host = env.REDIS_HOST;
  if (!url && !host) return null;

  // Skip during Next.js build phase
  if (env.isBuildPhase) return null;

  try {
  const options: RedisOptions = {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
    };
    const client = url
      ? new Redis(url, options)
      : new Redis({
        host: host || 'localhost',
        port: Number.parseInt(env.REDIS_PORT, 10) || 6379,
        password: env.REDIS_PASSWORD || undefined,
        ...options,
      });
    // Suppress unhandled error events to prevent build/runtime crashes
    client.on('error', () => {});
    return client;
  } catch {
    return null;
  }
}

function getRedis(): Redis | null {
  if (globalForRedis._redisInit) return globalForRedis._redis ?? null;
  globalForRedis._redisInit = true;
  globalForRedis._redis = createRedisClient();
  return globalForRedis._redis ?? null;
}

export const redis = getRedis();

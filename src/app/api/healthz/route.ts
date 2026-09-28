import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import packageJson from '../../../../package.json';

export const dynamic = 'force-dynamic';

type CheckStatus = { status: 'ok' | 'error' | 'skipped'; latency?: number; message?: string };

export async function GET() {
  let overallStatus: 'ok' | 'degraded' | 'down' = 'ok';

  // Fan-out the three independent subchecks. Previously these awaited
  // sequentially, padding healthz latency by Redis + MinIO timeouts on a
  // bad day. With Promise.all the response is bounded by the slowest
  // single check rather than their sum.
  const redisConfigured = !!(env.REDIS_URL || env.REDIS_HOST);
  const minioEndpoint = env.MINIO_ENDPOINT || '';
  const minioConfigured = !!minioEndpoint && minioEndpoint !== 'localhost';
  const storageRequired = !env.MINIO_ALLOW_FALLBACK;

  async function checkDatabase(): Promise<CheckStatus> {
    try {
      const start = Date.now();
      const { prisma } = await import('@/lib/prisma');
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', latency: Date.now() - start };
    } catch {
      return { status: 'error', message: 'Database unreachable' };
    }
  }

  async function checkRedis(): Promise<CheckStatus> {
    if (!redisConfigured) return { status: 'skipped', message: 'Redis not configured' };
    try {
      const start = Date.now();
      const mod = await import('@/lib/redis');
      if (!mod.redis) throw new Error('Redis not configured');
      await mod.redis.ping();
      return { status: 'ok', latency: Date.now() - start };
    } catch {
      return { status: 'skipped', message: 'Redis unavailable (using in-memory fallback)' };
    }
  }

  async function checkStorage(): Promise<CheckStatus> {
    if (!minioConfigured) {
      return storageRequired
        ? { status: 'error', message: 'External storage is required but not configured' }
        : { status: 'skipped', message: 'External storage not configured' };
    }
    try {
      const start = Date.now();
      const mod = await import('@/lib/minio');
      if (!mod.minioClient) throw new Error('MinIO not configured');
      await mod.minioClient.listBuckets();
      return { status: 'ok', latency: Date.now() - start };
    } catch {
      return { status: 'skipped', message: 'Storage unavailable (using DB fallback)' };
    }
  }

  const [database, redis, storage] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkStorage(),
  ]);

  const checks: Record<string, CheckStatus> = {
    database,
    redis,
    rateLimit: {
      status: 'ok',
      message: redis.status === 'ok' ? 'Using Redis' : 'Using in-memory fallback',
    },
    storage,
  };

  if (database.status === 'error') overallStatus = 'degraded';

  // Only mark as down if the database (the only required service) is unreachable
  if (checks.database.status === 'error') {
    overallStatus = 'down';
  }
  if (checks.storage.status === 'error') {
    overallStatus = overallStatus === 'down' ? 'down' : 'degraded';
  }

  // Public response: only expose status, no latencies or infrastructure details
  const publicHealth = {
    status: overallStatus,
    version: env.NEXT_PUBLIC_APP_VERSION || packageJson.version,
    timestamp: new Date().toISOString(),
    checks: Object.fromEntries(
      Object.entries(checks).map(([k, v]) => [k, { status: v.status }])
    ),
  };

  return NextResponse.json(publicHealth, {
    status: overallStatus === 'down' ? 503 : 200,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}

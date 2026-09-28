import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('MinIO client', () => {
  const m = readFileSync(join(process.cwd(), 'src/lib/minio.ts'), 'utf-8');
  it('has minioClient export', () => { expect(m).toContain('minioClient'); });
  it('has getBucket', () => { expect(m).toContain('getBucket'); });
  it('has ensureBucket', () => { expect(m).toContain('ensureBucket'); });
  it('reads env vars', () => { expect(m).toContain('MINIO_ENDPOINT'); });
});

describe('Prisma client', () => {
  const p = readFileSync(join(process.cwd(), 'src/lib/prisma.ts'), 'utf-8');
  it('has prisma export', () => { expect(p).toContain('prisma'); });
  it('uses Neon adapter', () => { expect(p).toContain('PrismaNeon'); });
  it('reads DATABASE_URL', () => { expect(p).toContain('DATABASE_URL'); });
  it('global singleton', () => { expect(p).toContain('globalForPrisma'); });
});

describe('Redis client', () => {
  const r = readFileSync(join(process.cwd(), 'src/lib/redis.ts'), 'utf-8');
  it('has redis export', () => { expect(r).toContain('redis'); });
  it('has lazyConnect', () => { expect(r).toContain('lazyConnect'); });
  it('has error suppression', () => { expect(r).toContain("on('error'"); });
  it('has build phase skip', () => { expect(r).toContain('isBuildPhase'); });
});

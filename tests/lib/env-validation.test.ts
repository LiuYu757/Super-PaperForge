import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const envExample = readFileSync(join(process.cwd(), '.env.example'), 'utf-8');
const envModule = readFileSync(join(process.cwd(), 'src/lib/env.ts'), 'utf-8');

describe('environment validation', () => {
  it('.env.example contains all critical vars', () => {
    const criticalVars = [
      'DATABASE_URL',
      'REDIS_URL',
      'REDIS_HOST',
      'REDIS_PORT',
      'REDIS_PASSWORD',
      'RATE_LIMIT_STRICT',
      'NEXTAUTH_SECRET',
      'AUTH_SECRET',
      'NEXTAUTH_URL',
      'ENCRYPTION_KEY',
      'MINIO_ENDPOINT',
      'MINIO_PORT',
      'MINIO_ACCESS_KEY',
      'MINIO_SECRET_KEY',
      'MINIO_BUCKET',
      'MINIO_USE_SSL',
      'SMTP_HOST',
      'SMTP_PORT',
      'SMTP_FROM',
      'WS_PORT',
      'GIT_REPOS_PATH',
      'NEXT_PUBLIC_WS_URL',
      'NEXT_PUBLIC_APP_URL',
      'AUTH_GOOGLE_ID',
      'AUTH_GITHUB_ID',
    ];
    for (const v of criticalVars) {
      expect(envExample).toContain(v);
    }
  });

  it('env module exports required vars', () => {
    expect(envModule).toContain('DATABASE_URL');
    expect(envModule).toContain('NEXTAUTH_SECRET');
    expect(envModule).toContain('AUTH_SECRET');
    expect(envModule).toContain('ENCRYPTION_KEY');
    expect(envModule).toContain('isProduction');
  });

  it('env module has build-phase safety', () => {
    expect(envModule).toContain('phase-production-build');
  });
});

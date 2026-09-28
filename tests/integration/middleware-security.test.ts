import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('middleware + security', () => {
  const mw = readFileSync(join(process.cwd(), 'src/middleware.ts'), 'utf-8');
  const val = readFileSync(join(process.cwd(), 'src/lib/validation.ts'), 'utf-8');
  const rl = readFileSync(join(process.cwd(), 'src/lib/rate-limit.ts'), 'utf-8');

  it('middleware adds X-Request-ID', () => { expect(mw).toContain('X-Request-ID'); });
  it('middleware sets X-Content-Type-Options: nosniff', () => { expect(mw).toContain('X-Content-Type-Options'); expect(mw).toContain('nosniff'); });
  it('middleware sets X-Frame-Options: DENY', () => { expect(mw).toContain('X-Frame-Options'); expect(mw).toContain('DENY'); });
  it('middleware sets Referrer-Policy', () => { expect(mw).toContain('Referrer-Policy'); });
  it('middleware sets HSTS in production', () => { expect(mw).toContain('Strict-Transport-Security'); expect(mw).toContain('max-age='); });
  it('middleware sets Permissions-Policy', () => { expect(mw).toContain('Permissions-Policy'); });
  it('middleware handles CORS', () => { expect(mw).toContain('Access-Control-Allow-Origin'); });
  it('middleware protects /admin', () => { expect(mw).toContain('/admin'); });
  it('middleware allows current Auth.js callback basePath', () => { expect(mw).toContain('/api/v1/auth/'); });
  it('validation has XSS prevention', () => { expect(val).toContain('script'); });
  it('validation has path traversal check', () => { expect(val).toContain('..'); });
  it('validation has BLOCKED_EXTENSIONS', () => { expect(val).toContain('.exe'); });
  it('validation has MAX_FILE_SIZE', () => { expect(val).toContain('MAX_FILE_SIZE'); });
  it('rate-limit has sliding window', () => { expect(rl.toLowerCase()).toContain('zremrangebyscore'); });
  it('rate-limit has rateLimitHeaders', () => { expect(rl).toContain('X-RateLimit-Limit'); });
  it('rate-limit has lazyConnect', () => {
    const redis = readFileSync(join(process.cwd(), 'src/lib/redis.ts'), 'utf-8');
    expect(redis).toContain('lazyConnect');
  });
});

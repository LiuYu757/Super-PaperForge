import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const route = readFileSync(
  join(process.cwd(), 'src/app/api/v1/ai/assist/route.ts'),
  'utf-8',
);

describe('POST /api/v1/ai/assist contract', () => {
  it('requires an authenticated session before doing anything else', () => {
    expect(route).toMatch(/await\s+auth\(\)/);
    expect(route).toContain('ApiErrors.unauthorized');
  });

  it('enforces a plan-aware per-user limit and the global rate limit constant', () => {
    // The per-user hourly cap is derived from the user's plan; the global cap
    // remains a fixed deployment-wide constant.
    expect(route).toContain('aiHourlyRateLimit');
    expect(route).toContain('RATE_LIMITS.AI_GLOBAL');
    expect(route).toContain('enforceRateLimit');
    expect(route).toContain("'rate:ai:global'");
    expect(route).toMatch(/`rate:ai:user:\$\{userId\}`/);
  });

  it('checks the global cap only after schema validation so blocked requests never bill', () => {
    // Per-user check must come before the global check so an individual abuser
    // is rejected without consuming a global slot. The global check must come
    // after assistSchema.parse so malformed requests can't drain the budget.
    const userIdx = route.search(/'rate:ai:user:|`rate:ai:user:/);
    const parseIdx = route.indexOf('assistSchema.parse');
    const globalIdx = route.indexOf("'rate:ai:global'");
    const fetchIdx = route.indexOf("fetch('https://api.anthropic.com");
    expect(userIdx).toBeGreaterThan(-1);
    expect(parseIdx).toBeGreaterThan(-1);
    expect(globalIdx).toBeGreaterThan(-1);
    expect(fetchIdx).toBeGreaterThan(-1);
    expect(userIdx).toBeLessThan(parseIdx);
    expect(parseIdx).toBeLessThan(globalIdx);
    expect(globalIdx).toBeLessThan(fetchIdx);
  });

  it('returns AI_OVERLOADED when the global cap is hit', () => {
    expect(route).toContain("'AI_OVERLOADED'");
    expect(route).toContain('rateLimitHeaders');
  });

  it('writes a privacy-preserving audit record after successful AI calls', () => {
    expect(route).toContain('logAuditAction');
    expect(route).toContain("'ai.assist'");
    expect(route).toContain('promptLength');
    expect(route).toContain('contextLength');
    expect(route).not.toMatch(/details:\s*\{[\s\S]*prompt/);
  });

  it('caps prompt and context input sizes', () => {
    expect(route).toMatch(/prompt:\s*z\.string\(\)\.min\(1\)\.max\(2000\)/);
    expect(route).toMatch(/context:\s*z\.string\(\)\.max\(5000\)/);
  });

  it('bounds the outbound Anthropic call (model, max_tokens, timeout)', () => {
    expect(route).toMatch(/model:\s*'claude-/);
    expect(route).toMatch(/max_tokens:\s*\d+/);
    expect(route).toMatch(/AbortSignal\.timeout\(\d+\)/);
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const wsIndex = readFileSync(
  join(process.cwd(), 'websocket/src/index.ts'),
  'utf-8',
);
const wsAuth = readFileSync(
  join(process.cwd(), 'websocket/src/auth.ts'),
  'utf-8',
);

describe('websocket hardening invariants', () => {
  it('fails fast at startup when NEXTAUTH_SECRET is missing', () => {
    // The cooperative process.exit(1) is what makes ops notice a missing
    // secret on deploy instead of silently 401'ing every real client.
    expect(wsAuth).toContain('NEXTAUTH_SECRET');
    expect(wsAuth).toMatch(/process\.exit\(\s*1\s*\)/);
  });

  it('exposes /healthz with auth-secret status', () => {
    expect(wsIndex).toContain("'/healthz'");
    expect(wsIndex).toContain('hasAuthSecret');
    expect(wsIndex).toMatch(/hasSecret\(\)\s*\?\s*200\s*:\s*503/);
  });

  it('caps message size and per-user connection count', () => {
    expect(wsIndex).toContain('MAX_MESSAGE_SIZE');
    expect(wsIndex).toContain('MAX_CONNECTIONS_PER_USER');
    expect(wsIndex).toMatch(/maxPayload:\s*MAX_MESSAGE_SIZE/);
  });

  it('enforces a per-connection idle timeout', () => {
    expect(wsIndex).toContain('IDLE_TIMEOUT_MS');
    expect(wsIndex).toContain('Idle timeout');
    expect(wsIndex).toMatch(/clearTimeout\(idleTimer\)/);
  });

  it('rejects malformed projectIds before authenticating', () => {
    // UUID-shaped check comes before auth so we don't burn jwt.verify CPU
    // on garbage URLs.
    const uuidIdx = wsIndex.search(/\/\^\[0-9a-f-\]\{36\}\$\/i/);
    const authIdx = wsIndex.indexOf('authenticateFromCookie(req)');
    expect(uuidIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeGreaterThan(uuidIdx);
  });
});

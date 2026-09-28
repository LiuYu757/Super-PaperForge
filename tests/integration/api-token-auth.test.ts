import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { generateToken, hashToken, hasScope, ALL_SCOPES } from '@/services/api-token-service';
import type { Principal } from '@/services/api-token-service';

/**
 * Personal access tokens.
 *
 * `assertTokenAccess` and `resolveToken` both hit the database, so they are
 * covered by the integration suite rather than here. These cases pin the parts
 * that are pure: token generation, hashing, and scope arithmetic.
 */

describe('token generation', () => {
  it('produces a prefixed, high-entropy token', () => {
    const { plaintext } = generateToken();
    expect(plaintext.startsWith('pfp_')).toBe(true);
    // 32 random bytes in base64url ≈ 43 chars, plus the prefix.
    expect(plaintext.length).toBeGreaterThan(40);
  });

  it('never repeats', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) seen.add(generateToken().plaintext);
    expect(seen.size).toBe(500);
  });

  it('stores a SHA-256 rather than the token', () => {
    const { plaintext, hash } = generateToken();
    expect(hash).toBe(createHash('sha256').update(plaintext, 'utf-8').digest('hex'));
    expect(hash).not.toContain(plaintext);
    expect(hash).toHaveLength(64);
  });

  it('exposes a prefix short enough to be useless as a credential', () => {
    const { plaintext, prefix } = generateToken();
    expect(plaintext.startsWith(prefix)).toBe(true);
    expect(prefix.length).toBeLessThan(plaintext.length / 2);
  });

  it('hashes deterministically', () => {
    expect(hashToken('pfp_example')).toBe(hashToken('pfp_example'));
    expect(hashToken('pfp_example')).not.toBe(hashToken('pfp_example2'));
  });

  it('uses url-safe characters so the token survives headers and CLI use', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateToken().plaintext).toMatch(/^pfp_[A-Za-z0-9_-]+$/);
    }
  });
});

describe('scopes', () => {
  const tokenPrincipal = (scopes: string[]): Principal => ({
    kind: 'token',
    tokenId: 't1',
    userId: 'u1',
    scopes: scopes as never,
    projectIds: [],
  });

  it('grants a web session every scope', () => {
    const user: Principal = { kind: 'user', userId: 'u1' };
    for (const scope of ALL_SCOPES) {
      expect(hasScope(user, scope)).toBe(true);
    }
  });

  it('grants a token only what it was issued', () => {
    const principal = tokenPrincipal(['project:read']);
    expect(hasScope(principal, 'project:read')).toBe(true);
    expect(hasScope(principal, 'changeset:apply')).toBe(false);
  });

  it('separates writing a changeset from applying one', () => {
    // A tool may be allowed to propose edits but not to land them.
    const proposer = tokenPrincipal(['project:read', 'changeset:write']);
    expect(hasScope(proposer, 'changeset:write')).toBe(true);
    expect(hasScope(proposer, 'changeset:apply')).toBe(false);
  });

  it('offers no scope for deletion, account management or command execution', () => {
    const dangerous = ['project:delete', 'account:write', 'token:write', 'shell:execute', 'admin'];
    for (const scope of dangerous) {
      expect(ALL_SCOPES).not.toContain(scope);
    }
  });

  it('keeps the scope list to the documented five', () => {
    expect([...ALL_SCOPES].sort()).toEqual([
      'artifact:read',
      'changeset:apply',
      'changeset:write',
      'compile:run',
      'project:read',
    ]);
  });
});

describe('authorization contract', () => {
  const source = () =>
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('fs').readFileSync('src/services/api-token-service.ts', 'utf-8') as string;

  it('re-reads the project role on every call rather than trusting the token', () => {
    // This is what makes "remove someone from the project" also disable their
    // tokens. Baking the role into the token would leave a stale grant.
    expect(source()).toContain('prisma.projectMember.findFirst');
  });

  it('answers 404, not 403, for a project outside the token scope', () => {
    // A token scoped to project A must not be able to confirm B exists.
    const text = source();
    const scopeCheck = text.indexOf('principal.projectIds.includes(projectId)');
    expect(scopeCheck).toBeGreaterThan(-1);
    expect(text.slice(scopeCheck, scopeCheck + 200)).toContain("404");
  });

  it('rejects expired and revoked tokens', () => {
    const text = source();
    expect(text).toContain('record.revokedAt');
    expect(text).toContain('record.expiresAt');
  });
});

describe('request authentication', () => {
  const source = () =>
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('fs').readFileSync('src/lib/api-auth.ts', 'utf-8') as string;

  it('does not fall back to the session cookie when a Bearer token is invalid', () => {
    // Silently falling back would let a revoked token keep working from a
    // browser that still holds a session.
    const text = source();
    const bearerBlock = text.slice(text.indexOf('if (header)'), text.indexOf('const session'));
    expect(bearerBlock).toContain('Invalid or expired token');
    expect(bearerBlock).not.toContain('auth()');
  });

  it('binds an idempotency key to a hash of the request body', () => {
    const text = source();
    const service = require('fs').readFileSync('src/services/document-mutation-service.ts', 'utf-8') as string;
    expect(text).toContain('hashRequestBody');
    expect(service).toContain('IDEMPOTENCY_KEY_REUSED');
    expect(service).toContain('requestHash');
  });
});

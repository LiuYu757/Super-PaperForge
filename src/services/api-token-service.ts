import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';

/**
 * Personal access tokens for external automation.
 *
 * A local AI tool authenticates with a PAT rather than a copied browser cookie.
 * Two properties matter:
 *
 *  1. The server stores only a SHA-256 of the token. A database leak does not
 *     yield usable credentials.
 *  2. A token is never an independent grant. Effective permission is always
 *     "token scopes ∩ the owner's *current* project role", resolved per call,
 *     so removing someone from a project immediately disables their tokens.
 */

/** Distinguishes PaperForge PATs from other bearer credentials. */
const TOKEN_PREFIX = 'pfp_';

/** Bytes of entropy in the random part of a token. */
const TOKEN_BYTES = 32;

export const ALL_SCOPES = [
  'project:read',
  'changeset:write',
  'changeset:apply',
  'compile:run',
  'artifact:read',
] as const;

export type Scope = (typeof ALL_SCOPES)[number];

/**
 * Scopes deliberately absent from the list above: project deletion, account
 * management, token management and anything resembling command execution. An
 * automation token must not be able to escalate itself or destroy a project.
 */

export interface TokenPrincipal {
  kind: 'token';
  tokenId: string;
  userId: string;
  scopes: Scope[];
  /** Empty means "any project the owner can reach". */
  projectIds: string[];
}

export interface UserPrincipal {
  kind: 'user';
  userId: string;
}

export type Principal = TokenPrincipal | UserPrincipal;

/** SHA-256 of a token's plaintext, lowercase hex. */
export function hashToken(plaintext: string): string {
  return crypto.createHash('sha256').update(plaintext, 'utf-8').digest('hex');
}

/**
 * Generate a new token. The plaintext is returned once and never stored.
 *
 * Uses `randomBytes`, not `Math.random`: the token is a credential.
 */
export function generateToken(): { plaintext: string; hash: string; prefix: string } {
  const random = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
  const plaintext = `${TOKEN_PREFIX}${random}`;
  return {
    plaintext,
    hash: hashToken(plaintext),
    // Enough to identify the token in a list, too little to use.
    prefix: plaintext.slice(0, 12),
  };
}

export interface CreateTokenInput {
  userId: string;
  name: string;
  scopes: Scope[];
  projectIds?: string[];
  expiresInDays?: number;
}

/**
 * Create a token for `userId`.
 *
 * The caller must already be authenticated as that user via the web session —
 * a token cannot mint another token, which is why `token:write` is not a scope.
 */
export async function createApiToken(input: CreateTokenInput) {
  const invalid = input.scopes.filter((s) => !ALL_SCOPES.includes(s));
  if (invalid.length > 0) {
    throw new ApiError(400, `Unknown scope(s): ${invalid.join(', ')}`);
  }
  if (input.scopes.length === 0) {
    throw new ApiError(400, 'At least one scope is required');
  }
  if (!input.name.trim()) {
    throw new ApiError(400, 'Token name is required');
  }

  // Refuse to scope a token to a project the creator cannot currently reach.
  if (input.projectIds && input.projectIds.length > 0) {
    const memberships = await prisma.projectMember.findMany({
      where: { userId: input.userId, projectId: { in: input.projectIds } },
      select: { projectId: true },
    });
    const reachable = new Set(memberships.map((m) => m.projectId));
    const unreachable = input.projectIds.filter((id) => !reachable.has(id));
    if (unreachable.length > 0) {
      throw new ApiError(403, 'Cannot scope a token to a project you are not a member of');
    }
  }

  const { plaintext, hash, prefix } = generateToken();

  const token = await prisma.apiToken.create({
    data: {
      userId: input.userId,
      name: input.name.trim(),
      tokenHash: hash,
      tokenPrefix: prefix,
      scopes: input.scopes,
      projectIds: input.projectIds ?? [],
      expiresAt: input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
        : null,
    },
    select: { id: true, name: true, tokenPrefix: true, scopes: true, projectIds: true, expiresAt: true, createdAt: true },
  });

  // The only time the plaintext exists outside the client.
  return { ...token, token: plaintext };
}

/**
 * Resolve a bearer token to a principal, or null when it is invalid, expired
 * or revoked.
 *
 * Callers must treat null as 401 and must not fall back to cookie auth: a
 * request that presents a bad Bearer token is a failed authentication, not an
 * anonymous one.
 */
export async function resolveToken(bearer: string): Promise<TokenPrincipal | null> {
  if (!bearer.startsWith(TOKEN_PREFIX)) return null;

  const record = await prisma.apiToken.findUnique({
    where: { tokenHash: hashToken(bearer) },
    select: {
      id: true,
      userId: true,
      scopes: true,
      projectIds: true,
      expiresAt: true,
      revokedAt: true,
    },
  });

  if (!record) return null;
  if (record.revokedAt) return null;
  if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) return null;

  // Best-effort usage timestamp; never block or fail the request on it.
  prisma.apiToken
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return {
    kind: 'token',
    tokenId: record.id,
    userId: record.userId,
    scopes: record.scopes as Scope[],
    projectIds: record.projectIds,
  };
}

/** Revoke a token. Idempotent: revoking twice is not an error. */
export async function revokeApiToken(tokenId: string, userId: string) {
  const result = await prisma.apiToken.updateMany({
    // Scoped by userId so one user cannot revoke another's token.
    where: { id: tokenId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count > 0;
}

/** List a user's tokens. Never includes hashes. */
export async function listApiTokens(userId: string) {
  return prisma.apiToken.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      tokenPrefix: true,
      scopes: true,
      projectIds: true,
      expiresAt: true,
      revokedAt: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

/** Whether a principal carries a scope. A web session has all of them. */
export function hasScope(principal: Principal, scope: Scope): boolean {
  if (principal.kind === 'user') return true;
  return principal.scopes.includes(scope);
}

/**
 * Enforce that `principal` may perform `scope` on `projectId`.
 *
 * Three checks, all required:
 *   - the token is allowed to touch this project at all;
 *   - the token carries the scope;
 *   - the owning user still holds a sufficient role on the project *now*.
 *
 * The last is what makes revocation-by-removal work, and it is why the project
 * role is re-read on every call instead of being baked into the token.
 */
export async function assertTokenAccess(
  principal: Principal,
  projectId: string,
  scope: Scope,
  roles: string[] = ['owner', 'editor'],
): Promise<void> {
  if (principal.kind === 'token') {
    if (principal.projectIds.length > 0 && !principal.projectIds.includes(projectId)) {
      // 404 rather than 403: a token scoped to project A should not be able to
      // confirm that project B exists.
      throw new ApiError(404, 'Project not found');
    }
    if (!principal.scopes.includes(scope)) {
      throw new ApiError(403, `Token is missing the required scope: ${scope}`);
    }
  }

  const membership = await prisma.projectMember.findFirst({
    where: { projectId, userId: principal.userId },
    select: { role: true },
  });

  if (!membership) {
    throw new ApiError(404, 'Project not found');
  }
  if (!roles.includes(membership.role)) {
    throw new ApiError(403, 'Insufficient project permissions');
  }
}

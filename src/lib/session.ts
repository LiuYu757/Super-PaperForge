/**
 * Session helpers that don't depend on next-auth's runtime. Kept separate
 * from lib/auth.ts so they can be imported from Vitest unit tests without
 * dragging the whole NextAuth import graph (next/server, etc.) into the
 * jsdom test environment.
 */

export interface AppSessionUser {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
  role: string;
}

/**
 * Extract the typed app user from a NextAuth session object. Returns null
 * when there is no session — callers should short-circuit with
 * ApiErrors.unauthorized() in that case.
 */
export function getAppUser(
  session: { user?: unknown } | null | undefined,
): AppSessionUser | null {
  if (!session?.user || typeof session.user !== 'object') return null;
  const u = session.user as Record<string, unknown>;
  if (typeof u.id !== 'string') return null;
  return {
    id: u.id,
    email: typeof u.email === 'string' ? u.email : null,
    name: typeof u.name === 'string' ? u.name : null,
    image: typeof u.image === 'string' ? u.image : null,
    role: typeof u.role === 'string' ? u.role : 'user',
  };
}

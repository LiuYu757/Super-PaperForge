import jwt from 'jsonwebtoken';
import { IncomingMessage } from 'http';
import { env } from './env';

const SECRET = env.NEXTAUTH_SECRET || env.AUTH_SECRET;
if (!SECRET) {
  // Refuse to start instead of silently rejecting every cookie — running
  // the websocket in this state means real users see opaque 401s and ops
  // never finds out their secret is missing. Fail fast at deploy time.
  console.error('[WebSocket] FATAL: NEXTAUTH_SECRET (or AUTH_SECRET) is not set');
  process.exit(1);
}

export function hasSecret(): boolean {
  return !!SECRET;
}

export function authenticateFromCookie(req: IncomingMessage): { id: string; role: string } | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;

  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k, v.join('=')];
    })
  );

  const token =
    cookies['next-auth.session-token'] ||
    cookies['__Secure-next-auth.session-token'] ||
    cookies['authjs.session-token'];
  if (!token) return null;

  try {
    if (!SECRET) return null;
    const decoded = jwt.verify(token, SECRET) as { id?: string; sub?: string; role?: string };
    return { id: decoded.id || decoded.sub || '', role: decoded.role || 'user' };
  } catch {
    return null;
  }
}

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { env } from '@/lib/env';

function normalizeOrigin(value: string): string | null {
  try {
    const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    return new URL(withScheme).origin;
  } catch {
    return null;
  }
}

function getAllowedApiOrigins() {
  const explicit = env.CORS_ALLOWED_ORIGINS ?? [];
  const devOrigins =
    env.isDevelopment
      ? ['http://localhost:3000', 'http://localhost']
      : [];
  return [...new Set([...explicit, ...devOrigins].filter(Boolean))];
}

function isOriginAllowed(origin: string | null, requestOrigin: string): boolean {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  if (normalized === requestOrigin) return true;
  return getAllowedApiOrigins().includes(normalized);
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const { pathname } = request.nextUrl;
  const isApiRoute = pathname.startsWith('/api/');
  const origin = request.headers.get('origin');
  const isStateChange = request.method !== 'GET' && request.method !== 'HEAD';

  const requestOrigin = request.nextUrl.origin;
  if (origin && !isOriginAllowed(origin, requestOrigin)) {
    if (isApiRoute) {
      const body = JSON.stringify({ error: 'Origin not allowed by CORS policy' });
      return new NextResponse(body, {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
  }

  // Add request ID for tracing
  const requestId = crypto.randomUUID();
  response.headers.set('X-Request-ID', requestId);

  // Security headers applied to every response
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (!env.isDevelopment) {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }

  // CORS headers for API routes
  if (isApiRoute) {
    const allowedOrigins = getAllowedApiOrigins();

    if (origin) {
      const normalized = normalizeOrigin(origin);
      if (normalized && (normalized === requestOrigin || allowedOrigins.includes(normalized))) {
        response.headers.set('Access-Control-Allow-Origin', normalized);
        response.headers.set('Vary', 'Origin');
      }
    }

    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    response.headers.set(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With, X-Request-ID, X-CSRF-Token',
    );
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Max-Age', '86400');

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, { status: 204, headers: response.headers });
    }

    if (isStateChange) {
      // CSRF protection: reject cross-origin state-changing requests
      // Sec-Fetch-Site is sent by all modern browsers and cannot be spoofed
      const secFetchSite = request.headers.get('sec-fetch-site');
      // Allow: same-origin, none (direct navigation), and missing header (older browsers/curl)
      if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
        // Skip CSRF check for Auth.js callback routes.
        if (!pathname.startsWith('/api/v1/auth/') && !pathname.startsWith('/api/auth/')) {
          return new NextResponse(JSON.stringify({ error: 'CSRF validation failed' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
    }
  }

  // Block access to authenticated-only pages for non-authenticated users (cookie presence check)
  const requiresAuth =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/projects') ||
    pathname.startsWith('/editor');

  if (requiresAuth) {
    const sessionToken =
      request.cookies.get('next-auth.session-token')?.value ||
      request.cookies.get('__Secure-next-auth.session-token')?.value;

    if (!sessionToken) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('callbackUrl', request.nextUrl.pathname + request.nextUrl.search);
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/api/:path*',
    '/admin/:path*',
    '/editor/:path*',
    '/projects/:path*',
  ],
};

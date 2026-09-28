const DEFAULT_APP_BASE_URL = 'http://localhost:3000';

function normalizeBaseUrl(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function getAppBaseUrl(): string {
  // Read process.env directly: the central env module captures values at module
  // load time, which breaks the fallback chain when NEXTAUTH_URL's default kicks
  // in or when callers mutate env at runtime (tests).
  return (
    normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL) ??
    normalizeBaseUrl(process.env.NEXTAUTH_URL) ??
    normalizeBaseUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
    normalizeBaseUrl(process.env.VERCEL_URL) ??
    DEFAULT_APP_BASE_URL
  );
}

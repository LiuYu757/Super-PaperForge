/**
 * Sanitize a post-login redirect URL to same-origin relative paths only.
 * Rejects absolute URLs, protocol-relative URLs, backslash variants, and
 * encoded forms of those vectors.
 */
export function sanitizeCallbackUrl(
  url: string | null | undefined,
  fallback = '/projects',
): string {
  if (!url) return fallback;

  // Must start with / but not // (protocol-relative URL like //evil.com).
  if (!url.startsWith('/') || url.startsWith('//')) return fallback;
  if (/[\x00-\x1f\x7f\\]/.test(url)) return fallback;

  // Reject encoded variants. Backslashes are included because browsers and
  // routers can normalize them into slashes in URL contexts.
  try {
    let decoded = url;
    for (let i = 0; i < 3; i += 1) {
      decoded = decodeURIComponent(decoded);
      if (decoded.startsWith('//') || /[\x00-\x1f\x7f\\]/.test(decoded)) {
        return fallback;
      }
      if (!/%[0-9a-f]{2}/i.test(decoded)) break;
    }
  } catch {
    return fallback;
  }

  return url;
}

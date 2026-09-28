import dns from 'dns';
import { ApiError } from './errors';

/**
 * SSRF defense for git remote URLs. Rejects loopback, private RFC1918,
 * link-local (incl. AWS / GCP metadata 169.254.169.254), CGNAT, multicast,
 * and reserved IPv6 ranges. Hostnames are DNS-resolved and every returned
 * record must be public.
 *
 * Known limitation: between link-time validation and pull-time fetch the
 * upstream DNS answer can change (DNS rebinding). Callers must therefore
 * invoke this from BOTH the link route and the push/pull service entry
 * points so the window for rebinding shrinks to a single resolve+connect.
 * A complete fix would require pinning the resolved IP into the connect
 * call, which isomorphic-git's HTTP transport does not expose.
 */
export async function assertPublicGitRemote(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ApiError(400, 'Invalid git remote URL', 'INVALID_GIT_URL');
  }

  const hostname = parsed.hostname;
  if (!hostname) {
    throw new ApiError(400, 'Git remote URL must have a hostname', 'INVALID_GIT_URL');
  }

  if (isIPv4Literal(hostname)) {
    if (isPrivateOrReservedIPv4(hostname)) {
      throw nonPublicError();
    }
    return;
  }

  // Node.js URL.hostname keeps the [...] brackets around IPv6 literals.
  if (looksLikeIPv6(hostname)) {
    const stripped = hostname.replace(/^\[|\]$/g, '');
    if (isPrivateOrReservedIPv6(stripped)) {
      throw nonPublicError();
    }
    return;
  }

  let addrs: dns.LookupAddress[];
  try {
    addrs = await dns.promises.lookup(hostname, { all: true });
  } catch {
    throw new ApiError(400, 'Could not resolve git remote hostname', 'GIT_RESOLVE_FAILED');
  }
  if (addrs.length === 0) {
    throw new ApiError(400, 'Git remote hostname has no public address', 'GIT_RESOLVE_FAILED');
  }
  for (const addr of addrs) {
    if (addr.family === 4 && isPrivateOrReservedIPv4(addr.address)) throw nonPublicError();
    if (addr.family === 6 && isPrivateOrReservedIPv6(addr.address)) throw nonPublicError();
  }
}

function nonPublicError(): ApiError {
  return new ApiError(
    403,
    'Git remote URL resolves to a non-public address. Use a publicly reachable host.',
    'PRIVATE_GIT_URL',
  );
}

function isIPv4Literal(host: string): boolean {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

function looksLikeIPv6(host: string): boolean {
  // URL.hostname returns the bracket-stripped form, so look for ':' or '::'.
  return host.includes(':');
}

function octets(ip: string): number[] {
  return ip.split('.').map((o) => Number(o));
}

function isPrivateOrReservedIPv4(ip: string): boolean {
  const [a, b] = octets(ip);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return true;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback 127.0.0.0/8
  if (a === 169 && b === 254) return true; // link-local incl. AWS/GCP metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking 198.18.0.0/15
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateOrReservedIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fe80:') || lower.startsWith('fe8') || lower.startsWith('fe9') ||
      lower.startsWith('fea') || lower.startsWith('feb')) return true; // fe80::/10
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA fc00::/7
  if (lower.startsWith('ff')) return true; // multicast
  // IPv4-mapped IPv6 (::ffff:0:0/96). Node normalises 127.0.0.1 into
  // ::ffff:7f00:1, so checking the prefix covers both dotted and hex forms.
  // Public servers should not be reachable via IPv4-mapped addresses; treat
  // the whole range as suspect.
  if (lower.startsWith('::ffff:')) return true;
  return false;
}

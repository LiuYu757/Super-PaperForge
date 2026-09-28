import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Unwrap standardized API response envelope.
 * If response has { data }, returns data. Otherwise returns as-is.
 */
export function unwrapApi<T = unknown>(json: unknown): T {
  if (json && typeof json === 'object' && 'data' in json) {
    return (json as { data: T }).data;
  }
  return json as T;
}

/**
 * Format a byte count as a short human-readable string ("3.2 MB", "12 B").
 * Accepts numbers or numeric strings (Prisma BigInt fields arrive as strings
 * when returned by the API). Uses 1024-based units to match every other
 * place in the UI.
 */
export function formatBytes(bytes: number | string | bigint | null | undefined): string {
  if (bytes === null || bytes === undefined) return '0 B';
  const n = typeof bytes === 'bigint'
    ? Number(bytes)
    : typeof bytes === 'string'
      ? parseFloat(bytes)
      : bytes;
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Compute two-letter initials from a display name.
 */
export function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

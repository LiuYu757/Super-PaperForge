function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

function parsePositiveInteger(name: string, fallback: number, bounds = { min: 1, max: 2147483647 }): number {
  const raw = process.env[name];
  const parsed = Number.parseInt(raw ?? '', 10);
  if (raw === undefined || Number.isNaN(parsed) || !Number.isInteger(parsed)) return fallback;
  if (parsed < bounds.min || parsed > bounds.max) return fallback;
  return parsed;
}

/**
 * Mode selector with a fixed allowed set. Anything unrecognised (including an
 * empty value) falls back to `def`, so a typo never silently selects the
 * legacy write channel.
 */
function parseMode<T extends string>(name: string, allowed: readonly T[], def: T): T {
  const raw = (process.env[name] ?? '').toLowerCase();
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : def;
}

export const env = {
  DATABASE_URL: required('DATABASE_URL'),

  WS_PORT: parsePositiveInteger('WS_PORT', 4001, { min: 1, max: 65535 }),
  WS_IDLE_TIMEOUT_MS: parsePositiveInteger('WS_IDLE_TIMEOUT_MS', 30 * 60 * 1000, { min: 1000, max: 86_400_000 }),

  NEXTAUTH_SECRET: optional('NEXTAUTH_SECRET'),
  AUTH_SECRET: optional('AUTH_SECRET'),

  // PR-1 R10: how the collaboration layer persists edits. `versioned` (default)
  // keeps Yjs in read-only/awareness mode — the server drops Yjs write syncs and
  // the editor saves through conditional HTTP PUTs carrying a SHA-256 baseline.
  // `yjs` restores the legacy write channel for deployments that opt out.
  EDITOR_SYNC_MODE: parseMode('EDITOR_SYNC_MODE', ['versioned', 'yjs'] as const, 'versioned'),
};

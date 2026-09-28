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

function parsePositiveInteger(name: string, fallback: number, bounds?: { min: number; max: number }): number {
  const raw = process.env[name];
  const parsed = Number.parseInt(raw ?? '', 10);
  const min = bounds?.min ?? 1;
  const max = bounds?.max ?? Number.MAX_SAFE_INTEGER;
  if (raw === undefined || Number.isNaN(parsed) || !Number.isInteger(parsed)) return fallback;
  if (parsed < min || parsed > max) return fallback;
  return parsed;
}

function parseBoolean(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  if (/^(1|true|yes|on)$/i.test(raw.trim())) return true;
  if (/^(0|false|no|off)$/i.test(raw.trim())) return false;
  return fallback;
}

export const env = {
  DATABASE_URL: required('DATABASE_URL'),

  REDIS_URL: optional('REDIS_URL'),
  REDIS_HOST: optional('REDIS_HOST', 'localhost'),
  REDIS_PORT: parsePositiveInteger('REDIS_PORT', 6379, { min: 1, max: 65535 }),
  REDIS_PASSWORD: optional('REDIS_PASSWORD') || undefined,

  MINIO_ENDPOINT: optional('MINIO_ENDPOINT', 'localhost'),
  MINIO_PORT: parsePositiveInteger('MINIO_PORT', 9000, { min: 1, max: 65535 }),
  MINIO_USE_SSL: parseBoolean('MINIO_USE_SSL'),
  MINIO_ACCESS_KEY: optional('MINIO_ACCESS_KEY'),
  MINIO_SECRET_KEY: optional('MINIO_SECRET_KEY'),
  MINIO_BUCKET: optional('MINIO_BUCKET', 'paperforge'),

  WORKER_MAX_ATTEMPTS: parsePositiveInteger('WORKER_MAX_ATTEMPTS', 3, { min: 1, max: 100 }),
  WORKER_LOCK_DURATION_MS: parsePositiveInteger('WORKER_LOCK_DURATION_MS', 180000, { min: 1, max: 7_200_000 }),
  RUNNER_URL: optional('RUNNER_URL'),
  TEX_IMAGE_DIGEST: optional('TEX_IMAGE_DIGEST'),
  COMPILE_DATA_PATH: optional('COMPILE_DATA_PATH'),
} as const;

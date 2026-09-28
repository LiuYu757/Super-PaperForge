import { Client } from 'minio';
import { env } from './env';

const globalForMinio = globalThis as unknown as { minioClient: Client };

function createMinioClient(): Client {
  const minioPort = Number.parseInt(env.MINIO_PORT || '9000', 10);
  return new Client({
    endPoint: env.MINIO_ENDPOINT || 'localhost',
    port: Number.isNaN(minioPort) ? 9000 : minioPort,
    useSSL: env.MINIO_USE_SSL,
    accessKey: env.MINIO_ACCESS_KEY || '',
    secretKey: env.MINIO_SECRET_KEY || '',
  });
}

export const minioClient = globalForMinio.minioClient || createMinioClient();

if (env.isDevelopment) globalForMinio.minioClient = minioClient;

/**
 * Returns the configured bucket name.
 */
export function getBucket(): string {
  return env.MINIO_BUCKET || 'paperforge';
}

/**
 * Ensures the configured bucket exists, creating it if necessary.
 * Caches the result so subsequent calls skip the network roundtrip.
 */
let bucketVerified = false;
export async function ensureBucket(): Promise<void> {
  if (bucketVerified) return;
  const bucket = getBucket();
  const exists = await minioClient.bucketExists(bucket);
  if (!exists) {
    await minioClient.makeBucket(bucket);
  }
  bucketVerified = true;
}

#!/usr/bin/env node
/**
 * Ensure the MinIO bucket used by the real-DB acceptance suite exists.
 *
 * The test stack in docker-compose.test.yml has no bucket-init sidecar, so we
 * create the bucket here before integration tests run. Reads the same
 * connection settings as .env.test.
 */
import { config as loadEnv } from 'dotenv';
import { Client as MinioClient } from 'minio';
loadEnv({ path: '.env.test', override: false });

const endpoint = process.env.TEST_MINIO_ENDPOINT;
const port = Number(process.env.TEST_MINIO_PORT);
const accessKey = process.env.TEST_MINIO_ACCESS_KEY;
const secretKey = process.env.TEST_MINIO_SECRET_KEY;
const bucket = process.env.TEST_MINIO_BUCKET;
if (!endpoint || !port || !accessKey || !secretKey || !bucket?.endsWith('-test')) {
  throw new Error('Dedicated TEST_MINIO_* target is required');
}
if (!['localhost', '127.0.0.1'].includes(endpoint) || port !== 9010) {
  throw new Error('Test bucket creation is limited to isolated local MinIO on port 9010');
}

const client = new MinioClient({
  endPoint: endpoint,
  port,
  useSSL: false,
  accessKey,
  secretKey,
});

const exists = await client.bucketExists(bucket);
if (!exists) {
  await client.makeBucket(bucket);
  console.log(`[test-env] created bucket ${bucket} on ${endpoint}:${port}`);
} else {
  console.log(`[test-env] bucket ${bucket} already exists`);
}
process.exit(0);

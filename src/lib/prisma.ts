import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client/client';
import { env } from './env';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/**
 * Choose a driver adapter for the configured database.
 *
 * Upstream used the Neon HTTP driver unconditionally, which only works against
 * a Neon-compatible proxy. A self-hosted deployment runs plain `postgres:16`
 * (see docker-compose.yml) and must be able to talk to it directly; the test
 * suite uses an isolated local Postgres on a non-default port. Both work with
 * the `pg` adapter. Keep the Neon adapter for `.neon.tech` connection strings
 * so existing Vercel deployments keep their serverless driver.
 */
function createPrismaClient(): PrismaClient {
  const connectionString = env.DATABASE_URL;
  const adapter = connectionString.includes('.neon.tech')
    ? new PrismaNeon({ connectionString })
    : new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (env.isDevelopment) globalForPrisma.prisma = prisma;
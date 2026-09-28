import path from 'node:path';
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';
import { getPrismaDatabaseUrl } from './prisma/env';

// Load .env.local (Next.js convention) then .env as fallback
config({ path: path.resolve(__dirname, '.env.local') });
config({ path: path.resolve(__dirname, '.env') });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: getPrismaDatabaseUrl(),
  },
});

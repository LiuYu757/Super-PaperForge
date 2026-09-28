import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';

const CRITICAL_FILES = [
  'src/lib/auth.ts', 'src/lib/prisma.ts', 'src/lib/redis.ts', 'src/lib/minio.ts',
  'src/lib/encryption.ts', 'src/lib/email.ts', 'src/lib/validation.ts',
  'src/lib/api-response.ts', 'src/lib/errors.ts', 'src/lib/rate-limit.ts',
  'src/lib/latex-completions.ts', 'src/lib/latex-language.ts', 'src/lib/latex-linter.ts',
  'src/lib/latex-fold.ts', 'src/lib/latex-snippets.ts', 'src/lib/latex-error-parser.ts',
  'src/middleware.ts', 'src/store/editor-store.ts',
  'src/app/page.tsx', 'src/app/layout.tsx', 'src/app/error.tsx', 'src/app/not-found.tsx',
  'src/app/sitemap.ts', 'src/app/opengraph-image.tsx',
  'CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md', 'LICENSE',
  '.github/workflows/ci.yml', '.github/dependabot.yml',
  'docker-compose.yml', 'Dockerfile', 'nginx/nginx.conf',
  'public/manifest.json', 'public/robots.txt',
];

describe('critical files exist', () => {
  CRITICAL_FILES.forEach(f => {
    it(f, () => { expect(existsSync(join(process.cwd(), f))).toBe(true); });
  });
});

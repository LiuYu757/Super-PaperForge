import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { dirname, join, posix } from 'path';

describe('Docker infrastructure', () => {
  const compose = readFileSync(join(process.cwd(), 'docker-compose.yml'), 'utf-8');
  const dockerfile = readFileSync(join(process.cwd(), 'Dockerfile'), 'utf-8');
  const nginx = readFileSync(join(process.cwd(), 'nginx/nginx.conf'), 'utf-8');

  it('compose has all 8 services', () => {
    ['postgres', 'redis', 'minio', 'mailhog', 'worker', 'websocket', 'app', 'nginx'].forEach(s => {
      expect(compose).toContain(`${s}:`);
    });
  });
  it('compose has resource limits', () => { expect(compose).toContain('memory:'); });
  it('compose has restart policies', () => { expect(compose).toContain('restart: unless-stopped'); });
  it('compose has healthchecks', () => { expect(compose).toContain('healthcheck:'); });
  it('Dockerfile runs as non-root', () => { expect(dockerfile).toContain('USER nextjs'); });
  it('Dockerfile has OCI labels', () => { expect(dockerfile).toContain('org.opencontainers.image'); });
  it('Dockerfile multi-stage on supported Node LTS', () => {
    expect(dockerfile).toContain('FROM node:22.19.0-alpine AS builder');
  });
  it('nginx has gzip', () => { expect(nginx).toContain('gzip on'); });
  it('nginx has security headers', () => { expect(nginx).toContain('X-Content-Type-Options'); });
  it('nginx has rate limiting', () => { expect(nginx).toContain('limit_req_zone'); });

  // Build artifacts produced by package build steps (not present at test time).
  // Treat as valid even if missing on disk — `docker build` runs after a build step.
  const BUILD_ARTIFACT_PREFIXES = ['dist', '.next', 'node_modules'];

  function isBuildArtifact(src: string): boolean {
    const normalized = src.replace(/^\.\//, '').replace(/\/+$/, '');
    return BUILD_ARTIFACT_PREFIXES.some(p => normalized === p || normalized.startsWith(`${p}/`));
  }

  function extractDockerfileCopySources(dockerfileBody: string): string[] {
    const sources: string[] = [];
    const re = /^(?:COPY|ADD)\s+(.+)$/gm;
    let match: RegExpExecArray | null;
    while ((match = re.exec(dockerfileBody)) !== null) {
      const operands = match[1].trim().split(/\s+/);
      if (operands.length < 2) continue;
      // Skip --from=stage copies: source lives in an earlier image, not the build context.
      if (operands.some(op => op.startsWith('--from='))) continue;
      const args = operands.filter(op => !op.startsWith('--'));
      if (args.length < 2) continue;
      // Last arg is destination; everything before is source(s).
      sources.push(...args.slice(0, -1));
    }
    return sources;
  }

  function dockerfileSourceExists(src: string, dockerfileDir: string): boolean {
    if (isBuildArtifact(src)) return true;
    // `COPY . .` — whole context, always valid.
    if (src === '.' || src === './') return true;
    // Strip trailing slash for fs check.
    const cleaned = src.replace(/\/+$/, '');
    // Glob patterns: verify at least one literal match. We only see `package*.json`
    // style globs; resolve the most common case (replace `*` with empty) and require
    // the non-glob variant to exist (i.e. `package.json` for `package*.json`).
    if (cleaned.includes('*')) {
      const literal = cleaned.replace(/\*/g, '');
      return existsSync(join(dockerfileDir, literal));
    }
    return existsSync(join(dockerfileDir, cleaned));
  }

  it.each([
    ['Dockerfile', '.'],
    ['worker/Dockerfile', 'worker'],
    ['websocket/Dockerfile', 'websocket'],
    ['texlive/Dockerfile', 'texlive'],
  ])('%s only references files that exist in its build context', (dockerfilePath, contextDir) => {
    const body = readFileSync(join(process.cwd(), dockerfilePath), 'utf-8');
    const sources = extractDockerfileCopySources(body);
    const absContext = join(process.cwd(), contextDir);
    const missing = sources.filter(src => !dockerfileSourceExists(src, absContext));
    expect(missing, `${dockerfilePath} references missing local sources: ${missing.join(', ')}`).toEqual([]);
  });

  it('docker-compose volume host paths exist', () => {
    // Match `- ./<path>:...` mount specs (relative host paths only).
    const re = /-\s+(\.\/[^\s:]+):[^\s]+/g;
    const missing: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = re.exec(compose)) !== null) {
      const hostPath = match[1];
      const resolved = join(process.cwd(), hostPath);
      if (!existsSync(resolved)) missing.push(hostPath);
    }
    expect(missing, `compose volumes reference missing host paths: ${missing.join(', ')}`).toEqual([]);
  });

  it('docker-compose build contexts point to dirs with a Dockerfile', () => {
    // Match `build: ./<path>` or `build: .`
    const re = /build:\s*(\S+)/g;
    const missing: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = re.exec(compose)) !== null) {
      const ctx = match[1];
      const dockerfilePath = posix.join(ctx, 'Dockerfile');
      const resolved = join(process.cwd(), dockerfilePath);
      if (!existsSync(resolved)) missing.push(`${ctx} (expected ${dockerfilePath})`);
    }
    expect(missing, `compose build contexts missing Dockerfile: ${missing.join(', ')}`).toEqual([]);
  });
});

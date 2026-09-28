import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('Vercel config', () => {
  it('vercel.json exists', () => { expect(existsSync(join(process.cwd(), 'vercel.json'))).toBe(true); });
  const v = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf-8'));
  it('has framework nextjs', () => { expect(v.framework).toBe('nextjs'); });
  it('has build command', () => { expect(v.buildCommand).toContain('build'); });
  it('has region', () => { expect(v.regions).toContain('iad1'); });
  it('deploys main only', () => { expect(v.git.deploymentEnabled.main).toBe(true); });
});

describe('deployment files', () => {
  it('Dockerfile non-root', () => {
    expect(readFileSync(join(process.cwd(), 'Dockerfile'), 'utf-8')).toContain('USER nextjs');
  });
  it('nginx has WebSocket', () => {
    expect(readFileSync(join(process.cwd(), 'nginx/nginx.conf'), 'utf-8')).toContain('Upgrade');
  });
  it('docker-compose has 3 volumes', () => {
    const dc = readFileSync(join(process.cwd(), 'docker-compose.yml'), 'utf-8');
    expect(dc).toContain('postgres_data');
    expect(dc).toContain('redis_data');
    expect(dc).toContain('minio_data');
  });
});

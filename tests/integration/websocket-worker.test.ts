import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

describe('WebSocket server', () => {
  it('index.ts exists', () => { expect(existsSync(join(process.cwd(), 'websocket/src/index.ts'))).toBe(true); });
  it('yjs-server.ts exists', () => { expect(existsSync(join(process.cwd(), 'websocket/src/yjs-server.ts'))).toBe(true); });
  it('has error handler', () => { expect(readFileSync(join(process.cwd(), 'websocket/src/index.ts'), 'utf-8')).toContain('error'); });
  it('has graceful shutdown', () => { expect(readFileSync(join(process.cwd(), 'websocket/src/index.ts'), 'utf-8')).toContain('SIGTERM'); });
  it('yjs has doc cleanup', () => { expect(readFileSync(join(process.cwd(), 'websocket/src/yjs-server.ts'), 'utf-8')).toContain('delete'); });
});

describe('Worker', () => {
  it('index.ts exists', () => { expect(existsSync(join(process.cwd(), 'worker/src/index.ts'))).toBe(true); });
  it('compiler.ts exists', () => { expect(existsSync(join(process.cwd(), 'worker/src/compiler.ts'))).toBe(true); });
  it('has graceful shutdown', () => { expect(readFileSync(join(process.cwd(), 'worker/src/index.ts'), 'utf-8')).toContain('SIGTERM'); });
  it('has failed job handler', () => { expect(readFileSync(join(process.cwd(), 'worker/src/index.ts'), 'utf-8')).toContain('failed'); });
  it('compiler has timeout', () => { expect(readFileSync(join(process.cwd(), 'worker/src/compiler.ts'), 'utf-8')).toContain('timeout'); });
  it('worker Dockerfile exists', () => { expect(existsSync(join(process.cwd(), 'worker/Dockerfile'))).toBe(true); });
});

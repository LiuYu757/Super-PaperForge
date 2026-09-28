import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('websocket server features', () => {
  const ws = readFileSync(join(process.cwd(), 'websocket/src/index.ts'), 'utf-8');
  it('has HTTP upgrade', () => { expect(ws).toContain('upgrade'); });
  it('has auth verification', () => { expect(ws).toContain('auth'); });
  it('has error handler', () => { expect(ws).toContain('error'); });
  it('has connection tracking', () => { expect(ws).toContain('userConnectionCount'); });

  const yjs = readFileSync(join(process.cwd(), 'websocket/src/yjs-server.ts'), 'utf-8');
  it('has Yjs doc', () => { expect(yjs).toContain('Y.Doc'); });
  it('has awareness', () => { expect(yjs).toContain('awareness'); });
  it('has doc cleanup', () => { expect(yjs).toContain('delete'); });
  it('has ws error handler', () => { expect(yjs).toContain('ws.on'); });
});

describe('online status hook', () => {
  const h = readFileSync(join(process.cwd(), 'src/hooks/use-online-status.ts'), 'utf-8');
  it('uses useSyncExternalStore', () => { expect(h).toContain('useSyncExternalStore'); });
  it('listens to online/offline', () => { expect(h).toContain('online'); expect(h).toContain('offline'); });
  it('has server snapshot', () => { expect(h).toContain('getServerSnapshot'); });
});
